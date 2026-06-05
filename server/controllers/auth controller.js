const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logAuditEvent } = require('../utils/audit');
const {
    deriveUsernameFromEmail,
    ensureAdminRoleForUser,
    findUserByEmail,
    isAdminEmail,
    normalizeEmail,
} = require('../utils/adminIdentity');

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const getJwtSecret = () => {
    const configuredSecret = process.env.JWT_SECRET || [process.env.ENGINE_SIGNATURE, process.env.SYSTEM_VECTOR]
        .filter(Boolean)
        .join(':');

    if (!configuredSecret) {
        throw new Error('JWT secret is not configured. Set JWT_SECRET or ENGINE_SIGNATURE/SYSTEM_VECTOR.');
    }

    return configuredSecret;
};

const buildTokenPayload = (user, sessionId) => ({
    id: user._id,
    sid: sessionId,
    role: user.role || 'user',
    mirrorMode: user.mirrorMode,
});

const createAuthToken = (user, sessionId) =>
    jwt.sign(buildTokenPayload(user, sessionId), getJwtSecret(), { expiresIn: `${SESSION_TTL_DAYS}d` });

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

const buildAuthResponse = (user, token) => ({
    _id: user._id,
    username: user.username || user.name,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    mirrorMode: user.mirrorMode,
    mfa: user.mfa || { enabled: false, method: 'none' },
    onboarding: user.onboarding || { completed: false },
    token,
});

const isDuplicateKeyError = (error) => error?.code === 11000;

// @desc    Register new operative
// @route   POST /api/auth/signup
const registerUser = async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    try {
        const userExists = await findUserByEmail(email);
        if (userExists) {
            return res.status(409).json({ message: 'An account already exists for this email. Please log in.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const normalizedUsername = deriveUsernameFromEmail(username.includes('@') ? username : `${username}@local.user`);

        let user = await User.create({
            name: username,
            username: normalizedUsername,
            email,
            password: hashedPassword,
            role: isAdminEmail(email) ? 'admin' : 'user',
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid operative data.' });
        }

        user = await ensureAdminRoleForUser(user);
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

        return res.status(201).json(buildAuthResponse(user, token));
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return res.status(409).json({ message: 'An account already exists for this email. Please log in.' });
        }

        console.error('[AUTH_ERR] Registration failed:', error?.message || error);
        return res.status(500).json({ message: 'Unable to create account right now. Please try again.' });
    }
};

// @desc    Authenticate operative
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    let user = await findUserByEmail(email);

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

    user.email = email;
    if (!user.username) user.username = deriveUsernameFromEmail(email);
    user = await ensureAdminRoleForUser(user);
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

    res.json(buildAuthResponse(user, token));
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
            const decoded = jwt.verify(token, getJwtSecret());
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
