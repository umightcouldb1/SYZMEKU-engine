const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logAuditEvent } = require('../utils/audit');

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const buildTokenPayload = (user, sessionId) => ({
    id: user._id,
    sid: sessionId,
    role: user.role || 'user',
    mirrorMode: user.mirrorMode,
});

const createAuthToken = (user, sessionId) =>
    jwt.sign(buildTokenPayload(user, sessionId), process.env.JWT_SECRET, { expiresIn: `${SESSION_TTL_DAYS}d` });

const setSessionCookie = (res, token) => {
    res.cookie('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_TTL_MS,
    });
};

const createPersistentSession = async (user, req) => {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await AuthSession.create({
        userId: user._id,
        sessionId,
        expiresAt,
        ip: req?.ip || '',
        userAgent: req?.headers?.['user-agent'] || '',
    });

    return { sessionId, expiresAt };
};

const buildAuthResponse = (user) => ({
    _id: user._id,
    username: user.name,
    email: user.email,
    role: user.role || 'user',
    mirrorMode: user.mirrorMode,
    mfa: user.mfa || { enabled: false, method: 'none' },
});

// @desc    Register new operative
// @route   POST /api/auth/signup
const registerUser = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        return res.status(400).json({ message: 'Operative already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
        name: username,
        email,
        password: hashedPassword,
    });

    if (!user) {
        return res.status(400).json({ message: 'Invalid operative data.' });
    }

    const { sessionId } = await createPersistentSession(user, req);
    const token = createAuthToken(user, sessionId);
    setSessionCookie(res, token);

    await logAuditEvent({
        category: 'auth',
        event: 'register_success',
        req,
        userId: user._id,
        role: user.role || 'user',
        success: true,
        details: { email: user.email },
    });

    res.status(201).json(buildAuthResponse(user));
};

// @desc    Authenticate operative
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        await logAuditEvent({
            category: 'auth',
            event: 'login_failed',
            req,
            userId: user?._id || null,
            role: user?.role || '',
            success: false,
            details: { email },
        });
        return res.status(401).json({ message: 'Access Denied: Invalid credentials.' });
    }

    const { sessionId } = await createPersistentSession(user, req);
    const token = createAuthToken(user, sessionId);
    setSessionCookie(res, token);

    await logAuditEvent({
        category: 'auth',
        event: 'login_success',
        req,
        userId: user._id,
        role: user.role || 'user',
        success: true,
    });

    res.json(buildAuthResponse(user));
};

// @desc    Logout operative
// @route   POST /api/auth/logout
const logoutUser = async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const cookieToken = (req.headers.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('session='));
    const token = bearer || (cookieToken ? decodeURIComponent(cookieToken.replace('session=', '')) : null);

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded?.sid) {
                await AuthSession.findOneAndUpdate({ sessionId: decoded.sid }, { revokedAt: new Date() });
            }
        } catch (_error) {
            // ignore invalid token during logout; cookie clear still proceeds
        }
    }

    res.cookie('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: new Date(0),
    });

    await logAuditEvent({
        category: 'auth',
        event: 'logout',
        req,
        userId: req.user?._id || null,
        role: req.user?.role || '',
        success: true,
    });

    res.status(200).json({ message: 'Logout successful.' });
};

module.exports = { registerUser, loginUser, logoutUser };
