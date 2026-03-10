const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const User = require('../../models/User');
const { registerUser, loginUser, logoutUser } = require('../../controllers/auth controller');
const { protect } = require('../../middleware/authMiddleware');

// @route POST /api/auth/signup
router.post('/signup', asyncHandler(registerUser));
// compatibility alias
router.post('/register', asyncHandler(registerUser));

// @route POST /api/auth/login
router.post('/login', asyncHandler(loginUser));

// @route POST /api/auth/logout
router.post('/logout', protect, asyncHandler(logoutUser));

// @route GET /api/auth/mfa/status
router.get('/mfa/status', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('mfa');
  return res.json({
    enabled: Boolean(user?.mfa?.enabled),
    method: user?.mfa?.method || 'none',
    enrolledAt: user?.mfa?.enrolledAt || null,
    ready: true,
  });
}));

module.exports = router;
