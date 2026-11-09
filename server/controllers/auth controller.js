const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { logAuditEvent } = require('../utils/audit');
const { getJwtSecret } = require('../utils/jwtSecret');
const { ensureIdentityIndex } = require('../utils/identityIndex');
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

const isProduction = () => process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

const getCookieOptions = (req, overrides = {}) => {
    const secure = isProduction();
    return {
        httpOnly: true,
        secure,
        sameSite: secure ? 'none' : 'lax',
        path: '/',
        ...overrides,
    };
};

const setSessionCookie = (req, res, token) => {
    res.cookie('session', token, {
        ...getCookieOptions(req),
        maxAge: SESSION_TTL_MS,
    });
};

const getCookieToken = (cookieHeader = '') => {
    const sessionCookie = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('session='));

    if (!sessionCookie) return null;
    return decodeURIComponent(sessionCookie.replace('session=', ''));
};

const getRequestToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
    return getCookieToken(req.headers.cookie || '');
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

const extendPersistentSession = async (sessionId, req) => {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    return AuthSession.findOneAndUpdate(
        {
            sessionId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
        },
        {
            expiresAt,
            ip: req?.ip || '',
            userAgent: req?.headers?.['user-agent'] || '',
        },
        { new: true }
    );
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

    if (!username || !email || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    try {
        // The public signup route never provisions privileged identities.
        // Admin bootstrap and verified Google sign-in remain separate paths.
        if (isAdminEmail(email)) {
            return res.status(409).json({ message: 'An account already exists for this email. Please log in.' });
        }
        const userExists = await findUserByEmail(email);
        if (userExists) {
            return res.status(409).json({ message: 'An account already exists for this email. Please log in.' });
        }

        await ensureIdentityIndex();
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const normalizedUsername = deriveUsernameFromEmail(username.includes('@') ? username : `${username}@local.user`);

        let user = await User.create({
            name: username,
            username: normalizedUsername,
            email,
            password: hashedPassword,
            role: User.ROLES.USER,
            identity: { version: 1, passwordEnabled: true },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid operative data.' });
        }

        const { sessionId } = await createPersistentSession(user, req);
        const token = createAuthToken(user, sessionId);
        setSessionCookie(req, res, token);

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
        if (error.code === 'AUTH_IDENTITY_INDEX_UNAVAILABLE') {
            return res.status(503).json({ message: error.message });
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

    if (!email || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    let user = await findUserByEmail(email);
    if (user && user.identity !== undefined
        && (!user.identity || user.identity.version !== 1 || typeof user.identity.passwordEnabled !== 'boolean')) {
        return res.status(503).json({ message: 'Account sign-in needs support. Please try again later.' });
    }
    // Bootstrap/reset configuration must never turn a failed public login into
    // credential replacement. Existing passwords and sessions are not mutated.
    const passwordMatches = Boolean(user && user.identity?.passwordEnabled !== false
        && await bcrypt.compare(password, user.password));

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
    setSessionCookie(req, res, token);

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
        // Provider subject is authoritative once linked; email is only a fallback
        // for new or explicitly legacy identities.
        let user = await User.findOne({ 'identity.googleSubject': googleProfile.googleId });
        if (!user) user = await findUserByEmail(googleProfile.email);
        let isNewUser = false;

        if (!user) {
            await ensureIdentityIndex();
            const preferredUsername = googleProfile.givenName || deriveUsernameFromEmail(googleProfile.email);
            const username = await resolveUniqueUsername(preferredUsername);
            const password = await buildGooglePasswordHash(googleProfile.googleId);

            user = await User.create({
                name: googleProfile.name,
                username,
                email: googleProfile.email,
                password,
                role: isAdminEmail(googleProfile.email) ? User.ROLES.COMMANDER_IN_CHIEF : User.ROLES.USER,
                identity: {
                    version: 1,
                    passwordEnabled: false,
                    googleSubject: googleProfile.googleId,
                    emailVerifiedAt: new Date(),
                },
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
            if (user.identity !== undefined
                && (!user.identity || user.identity.version !== 1 || typeof user.identity.passwordEnabled !== 'boolean')) {
                return res.status(503).json({ message: 'Account sign-in needs support. Please try again later.' });
            }
            if (user.identity?.version === 1) {
                const linkedSubject = user.identity.googleSubject;
                if (linkedSubject && linkedSubject !== googleProfile.googleId) {
                    return res.status(401).json({ message: 'Google identity does not match this account.' });
                }
                if (!linkedSubject) {
                    const linkPassword = req.body?.password;
                    const canLink = user.identity.passwordEnabled === true
                        && typeof linkPassword === 'string' && linkPassword.length > 0
                        && await bcrypt.compare(linkPassword, user.password);
                    if (!canLink) {
                        return res.status(409).json({
                            code: 'GOOGLE_ACCOUNT_LINK_REQUIRED',
                            message: 'This email has a password account. Enter its password, then choose Google again to link it. If you did not create that account or do not know its password, contact support before continuing.',
                        });
                    }
                    // Both proofs were checked. A concurrent credential change
                    // or link must invalidate this attempt, not issue a session.
                    await ensureIdentityIndex();
                    user = await User.findOneAndUpdate({
                        _id: user._id,
                        password: user.password,
                        'identity.version': 1,
                        'identity.passwordEnabled': true,
                        'identity.googleSubject': { $exists: false },
                    }, { $set: {
                        'identity.googleSubject': googleProfile.googleId,
                        'identity.emailVerifiedAt': new Date(),
                    } }, { new: true, runValidators: true });
                    if (!user) {
                        return res.status(409).json({ message: 'Account sign-in changed. Please start sign-in again.' });
                    }
                }
            }
            // Legacy accounts intentionally retain their current sign-in behavior.
            // Closing their historical email-linking risk requires a reviewed
            // identity migration, not guessing provenance or resetting passwords.
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
        setSessionCookie(req, res, token);

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
        if (isDuplicateKeyError(error)) {
            return res.status(409).json({ message: 'Account sign-in changed. Please start sign-in again.' });
        }
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

// @desc    Refresh active operative session
// @route   POST /api/auth/refresh
const refreshSession = async (req, res) => {
    const token = getRequestToken(req) || String(req.body?.refreshToken || req.body?.token || '').trim();

    if (!token) {
        return res.status(401).json({ message: 'No active session token.' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), { ignoreExpiration: true });
        if (!decoded?.id || !decoded?.sid) {
            return res.status(401).json({ message: 'Invalid session token.' });
        }

        const existingSession = await AuthSession.findOne({
            sessionId: decoded.sid,
            userId: decoded.id,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
        });

        if (!existingSession) {
            return res.status(401).json({ message: 'Session expired or revoked.' });
        }

        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found.' });
        }

        const refreshedSession = await extendPersistentSession(decoded.sid, req);
        if (!refreshedSession) {
            return res.status(401).json({ message: 'Session expired or revoked.' });
        }

        const refreshedToken = createAuthToken(user, decoded.sid);
        setSessionCookie(req, res, refreshedToken);

        await logAuditEvent({
            category: 'auth',
            event: 'session_refresh_success',
            req,
            userId: user._id,
            role: user.role || User.ROLES.USER,
            success: true,
        });

        return res.json({
            ...buildAuthResponse(user, refreshedToken),
            expiresAt: refreshedSession.expiresAt,
        });
    } catch (error) {
        await logAuditEvent({
            category: 'auth',
            event: 'session_refresh_failed',
            req,
            success: false,
            details: { message: error?.message || 'Refresh failed' },
        }).catch(() => {});

        return res.status(401).json({ message: 'Session refresh failed.' });
    }
};

// @desc    Logout operative
// @route   POST /api/auth/logout
const logoutUser = async (req, res) => {
    const token = getRequestToken(req);

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
        ...getCookieOptions(req),
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

module.exports = { registerUser, loginUser, googleLoginUser, refreshSession, logoutUser };
