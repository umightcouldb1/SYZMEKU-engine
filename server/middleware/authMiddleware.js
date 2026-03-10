const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { logAuditEvent } = require('../utils/audit');

const getCookieToken = (cookieHeader = '') => {
    const sessionCookie = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('session='));

    if (!sessionCookie) {
        return null;
    }

    return decodeURIComponent(sessionCookie.replace('session=', ''));
};

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else {
        token = getCookieToken(req.headers.cookie);
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded?.sid) {
            res.status(401);
            throw new Error('Not authorized, invalid session token');
        }

        const session = await AuthSession.findOne({ sessionId: decoded.sid, userId: decoded.id, revokedAt: null });
        if (!session || (session.expiresAt && session.expiresAt < new Date())) {
            res.status(401);
            throw new Error('Not authorized, session expired');
        }

        // Get user from the token payload (excluding the password hash)
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            res.status(401);
            throw new Error('User not found');
        }

        req.sessionId = decoded.sid;
        next();
    } catch (error) {
        console.error(error);
        res.status(401);
        throw new Error('Not authorized, token failed');
    }
});

const authorizeRoles = (...allowedRoles) =>
    asyncHandler(async (req, res, next) => {
        if (!req.user) {
            res.status(401);
            throw new Error('Not authorized');
        }

        if (!allowedRoles.includes(req.user.role)) {
            await logAuditEvent({
                category: 'access',
                event: 'role_access_denied',
                req,
                userId: req.user._id,
                role: req.user.role,
                success: false,
                details: { allowedRoles },
            });
            return res.status(403).json({ message: 'Access denied' });
        }

        next();
    });

module.exports = { protect, authorizeRoles };
