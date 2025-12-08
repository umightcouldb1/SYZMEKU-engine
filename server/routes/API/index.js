const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/projects', require('./projectRoutes'));
router.use('/fixes', require('./fixesRoutes')); 

// NEW: Add the Payment Route
router.use('/payment', require('./paymentRoutes')); 

module.exports = router;
