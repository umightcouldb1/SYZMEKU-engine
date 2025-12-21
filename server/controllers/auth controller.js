// File: server/controllers/auth controller.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @desc    Register new operative
// @route   POST /api/auth/signup
const registerUser = async (req, res) => {
    const { username, email, password } = req.body;
    
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

    if (user) {
        res.status(201).json({
            _id: user._id,
            username: user.name,
            email: user.email,
            token: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' }),
        });
    } else {
        res.status(400).json({ message: 'Invalid operative data.' });
    }
};

// @desc    Authenticate operative
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
        res.json({
            _id: user._id,
            username: user.name,
            email: user.email,
            token: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' }),
        });
    } else {
        res.status(401).json({ message: 'Access Denied: Invalid credentials.' });
    }
};

module.exports = { registerUser, loginUser };
