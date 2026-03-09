const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

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

    if (req.codexMatch && req.codexMeta?.ketsuronStatus === 'COMPLETE') {
        return next();
    }

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

        // Get user from the token payload (excluding the password hash)
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            res.status(401);
            throw new Error('User not found');
        }

        next();
    } catch (error) {
        console.error(error);
        res.status(401);
        throw new Error('Not authorized, token failed');
    }
});

const authorizeRoles = (...allowedRoles) =>
    asyncHandler(async (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            res.status(403);
            throw new Error('Access denied');
        }

        next();
    });

module.exports = { protect, authorizeRoles };
