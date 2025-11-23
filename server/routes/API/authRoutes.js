const router = require('express').Router();
const jwt = require('jsonwebtoken');

// NOTE: The 'SYZMEKU_SECRET_KEY' is still required to generate a valid token.
const generateToken = (id) => {
    return jwt.sign({ id }, 'SYZMEKU_SECRET_KEY', {
        expiresIn: '30d',
    });
};

// @route POST /api/auth/signup
router.post('/signup', async (req, res) => {
    // MOCK RESPONSE: Pretend registration worked and return a token
    const { username, email } = req.body;
    res.status(201).json({
        _id: 'MOCKED_ID_123',
        username: username || 'MOCKED_USER',
        email: email,
        token: generateToken('MOCKED_ID_123'),
        message: 'MOCKED Registration successful'
    });
});

// @route POST /api/auth/login
router.post('/login', async (req, res) => {
    // MOCK RESPONSE: Pretend login worked and return a token
    const { email } = req.body;
    res.json({
        _id: 'MOCKED_ID_456',
        username: email,
        email: email,
        token: generateToken('MOCKED_ID_456'),
        message: 'MOCKED Login successful'
    });
});

module.exports = router;
