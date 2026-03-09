// File: server/controllers/auth controller.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const buildTokenPayload = (user) => ({
    id: user._id,
    role: user.role || 'user',
    mirrorMode: user.mirrorMode,
});

const createAuthToken = (user) =>
    jwt.sign(buildTokenPayload(user), process.env.JWT_SECRET, { expiresIn: '30d' });

const setSessionCookie = (res, token) => {
    res.cookie('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
    });
};

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

    const token = createAuthToken(user);
    setSessionCookie(res, token);

    res.status(201).json({
        _id: user._id,
        username: user.name,
        email: user.email,
        role: user.role || 'user',
        mirrorMode: user.mirrorMode,
        token,
    });
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
        return res.status(401).json({ message: 'Access Denied: Invalid credentials.' });
    }

    const token = createAuthToken(user);
    setSessionCookie(res, token);

    res.json({
        _id: user._id,
        username: user.name,
        email: user.email,
        role: user.role || 'user',
        mirrorMode: user.mirrorMode,
        token,
    });
};

// @desc    Logout operative
// @route   POST /api/auth/logout
const logoutUser = async (_req, res) => {
    res.cookie('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: new Date(0),
    });

    res.status(200).json({ message: 'Logout successful.' });
};

module.exports = { registerUser, loginUser, logoutUser };
