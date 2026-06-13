const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { getProfile, updateProfile } = require('../controllers/profileController');

router.get('/', protect, getProfile);
router.put('/', protect, updateProfile);

module.exports = router;
