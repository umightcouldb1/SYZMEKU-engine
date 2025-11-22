const router = require('express').Router();
const projectRoutes = require('./projectRoutes');
// const userRoutes = require('./userRoutes'); // Future use

// API routes will be prefixed with /api by the main server file

router.use('/projects', projectRoutes);
// router.use('/users', userRoutes); // Future use

module.exports = router;
