const router = require('express').Router();
const jwt = require('jsonwebtoken');

// NOTE: Uses the hardcoded secret key to generate a valid-format JWT.
const generateToken = (id) => {
    return jwt.sign({ id }, 'SYZMEKU_SECRET_KEY', {
        expiresIn: '30d',
    });
};

// @route POST /api/auth/signup
router.post('/signup', (req, res) => {
    // MOCK RESPONSE: Returns a dummy token without touching the database.
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
router.post('/login', (req, res) => {
    // MOCK RESPONSE: Returns a dummy token without touching the database.
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
