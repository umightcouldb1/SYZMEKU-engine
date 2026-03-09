const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const { registerUser, loginUser, logoutUser } = require('../../controllers/auth controller');

// @route POST /api/auth/signup
router.post('/signup', asyncHandler(registerUser));

// @route POST /api/auth/login
router.post('/login', asyncHandler(loginUser));

// @route POST /api/auth/logout
router.post('/logout', asyncHandler(logoutUser));

module.exports = router;
