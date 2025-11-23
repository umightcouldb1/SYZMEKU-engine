const router = require('express').Router();
const projectRoutes = require('./projectRoutes');
const authRoutes = require('./authRoutes'); // New Import

// Projects routes are prefixed with /api/projects
router.use('/projects', projectRoutes);

// Authentication routes are prefixed with /api/auth
router.use('/auth', authRoutes); // New Auth Route

module.exports = router;
