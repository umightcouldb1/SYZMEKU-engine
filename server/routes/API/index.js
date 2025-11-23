const router = require('express').Router();
const projectRoutes = require('./projectRoutes');
const authRoutes = require('./authRoutes'); 

router.use('/projects', projectRoutes);
router.use('/auth', authRoutes); 

module.exports = router;
