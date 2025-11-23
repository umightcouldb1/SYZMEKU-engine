const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../../models/User'); // Assuming path is correct

// Utility function to generate JWT
const generateToken = (id) => {
    // NOTE: Replace 'YOUR_SECRET_KEY' with a strong key in a .env file later.
    return jwt.sign({ id }, 'SYZMEKU_SECRET_KEY', {
        expiresIn: '30d',
    });
};

// @route POST /api/auth/signup
// @desc Register new user
router.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        if (!username || !email || !password) {
            return res.status(400).json({ msg: 'Please enter all fields' });
        }

        // Check for existing user
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = await User.create({ username, email, password });

        if (user) {
            res.status(201).json({
                _id: user.id,
                username: user.username,
                email: user.email,
                token: generateToken(user._id),
                message: 'Registration successful'
            });
        } else {
            res.status(400).json({ msg: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Server error during signup' });
    }
});

// @route POST /api/auth/login
// @desc Authenticate user and get token
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check for user email
        const user = await User.findOne({ email });

        if (user && (await user.comparePassword(password))) {
            res.json({
                _id: user.id,
                username: user.username,
                email: user.email,
                token: generateToken(user._id),
                message: 'Login successful'
            });
        } else {
            res.status(401).json({ msg: 'Invalid credentials' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Server error during login' });
    }
});

module.exports = router;
