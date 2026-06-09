const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { logAuditEvent } = require('../utils/audit');
const { getJwtSecret } = require('../utils/jwtSecret');
const {
    deriveUsernameFromEmail,
    ensureAdminRoleForUser,
    findUserByEmail,
    isAdminEmail,
    normalizeEmail,
    resolveUniqueUsername,
} = require('../utils/adminIdentity');

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const googleOAuthClient = new OAuth2Client();

const buildTokenPayload = (user, sessionId) => ({
    id: user._id,
    sid: sessionId,
    role: user.role || User.ROLES.USER,
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
    role: user.role || User.ROLES.USER,
    mirrorMode: user.mirrorMode,
    mfa: user.mfa || { enabled: false, method: 'none' },
    onboarding: user.onboarding || { completed: false },
    token,
});

const isDuplicateKeyError = (error) => error?.code === 11000;

const buildUsernameFromEmail = (email) => process.env.ADMIN_USERNAME || deriveUsernameFromEmail(email);

const verifyGoogleCredential = async (credential) => {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

    if (!googleClientId) {
        const error = new Error('Google OAuth client ID is not configured.');
        error.statusCode = 503;
        throw error;
    }

    const ticket = await googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
    });

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);

    if (!payload?.sub || !email || payload?.email_verified !== true) {
        const error = new Error('Google credential is invalid or email is not verified.');
        error.statusCode = 401;
        throw error;
    }

    return {
        googleId: payload.sub,
        email,
        name: String(payload.name || payload.given_name || email.split('@')[0] || 'Google User').trim(),
        givenName: String(payload.given_name || '').trim(),
        picture: String(payload.picture || '').trim(),
    };
};

const buildGooglePasswordHash = async (googleId) => {
    const opaquePassword = `GOOGLE_OAUTH:${googleId}:${randomUUID()}`;
    return bcrypt.hash(opaquePassword, 10);
};

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
            role: isAdminEmail(email) ? User.ROLES.COMMANDER_IN_CHIEF : User.ROLES.USER,
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
            role: user.role || User.ROLES.USER,
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
    let passwordMatches = Boolean(user && await bcrypt.compare(password, user.password));

    if (!passwordMatches && process.env.RESET_ADMIN_PASSWORD === 'true' && isAdminEmail(email)) {
        console.log('[SYS-INIT] Admin bootstrap login authorized by reset flag. Setting submitted password as admin password.');
        const hashedPassword = await bcrypt.hash(password, 10);

        if (!user) {
            user = await User.create({
                name: process.env.ADMIN_NAME || 'System Commander',
                username: await resolveUniqueUsername(buildUsernameFromEmail(email)),
                email,
                password: hashedPassword,
                role: User.ROLES.COMMANDER_IN_CHIEF,
                isVerified: true,
            });
        } else {
            user.email = email;
            user.username = user.username || await resolveUniqueUsername(buildUsernameFromEmail(email), user._id);
            user.password = hashedPassword;
            if (user.isVerified !== undefined) user.isVerified = true;
            await user.save();
            user = await ensureAdminRoleForUser(user);
        }

        passwordMatches = true;
    }

    if (!user || !passwordMatches) {
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
        role: user.role || User.ROLES.USER,
        success: true,
    });

    res.json(buildAuthResponse(user, token));
};

// @desc    Authenticate operative with Google Identity Services
// @route   POST /api/auth/google
const googleLoginUser = async (req, res) => {
    const credential = String(req.body?.credential || req.body?.idToken || '').trim();

    if (!credential) {
        return res.status(400).json({ message: 'Google credential is required.' });
    }

    try {
        const googleProfile = await verifyGoogleCredential(credential);
        let user = await findUserByEmail(googleProfile.email);
        let isNewUser = false;

        if (!user) {
            const preferredUsername = googleProfile.givenName || deriveUsernameFromEmail(googleProfile.email);
            const username = await resolveUniqueUsername(preferredUsername);
            const password = await buildGooglePasswordHash(googleProfile.googleId);

            user = await User.create({
                name: googleProfile.name,
                username,
                email: googleProfile.email,
                password,
                role: isAdminEmail(googleProfile.email) ? User.ROLES.COMMANDER_IN_CHIEF : User.ROLES.USER,
                onboarding: {
                    completed: false,
                    completedAt: null,
                    profile: {
                        preferredName: googleProfile.givenName || googleProfile.name || '',
                        lifeStage: '',
                        supportAreas: [],
                        mentorStyle: 'gentle',
                        sovereignMatrixNote: '',
                        onboardingReflection: '',
                        baseline: {
                            sleep: 0,
                            stress: 0,
                            energy: 0,
                            mood: '',
                            symptoms: '',
                            focusChallenge: '',
                        },
                        goals: [],
                        signalSetup: 'manual',
                    },
                },
            });
            isNewUser = true;
        } else {
            let changed = false;
            if (!user.name && googleProfile.name) {
                user.name = googleProfile.name;
                changed = true;
            }
            if (!user.username) {
                user.username = await resolveUniqueUsername(deriveUsernameFromEmail(googleProfile.email), user._id);
                changed = true;
            }
            if (!user.onboarding) {
                user.onboarding = { completed: false, profile: {} };
                changed = true;
            }
            if (changed) await user.save();
            user = await ensureAdminRoleForUser(user);
        }

        const { sessionId } = await createPersistentSession(user, req);
        const token = createAuthToken(user, sessionId);
        setSessionCookie(res, token);

        await logAuditEvent({
            category: 'auth',
            event: isNewUser ? 'google_register_success' : 'google_login_success',
            req,
            userId: user._id,
            role: user.role || User.ROLES.USER,
            success: true,
            details: { email: user.email },
        });

        return res.status(isNewUser ? 201 : 200).json({
            ...buildAuthResponse(user, token),
            authProvider: 'google',
            picture: googleProfile.picture,
            isNewUser,
        });
    } catch (error) {
        const statusCode = error?.statusCode || 401;
        await logAuditEvent({
            category: 'auth',
            event: 'google_login_failed',
            req,
            success: false,
            details: { message: error?.message || 'Google login failed' },
        });
        console.error('[AUTH_ERR] Google OAuth failed:', error?.message || error);
        return res.status(statusCode).json({ message: error?.message || 'Google authentication failed.' });
    }
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

module.exports = { registerUser, loginUser, googleLoginUser, logoutUser };
