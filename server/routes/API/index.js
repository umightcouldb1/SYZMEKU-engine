const router = require('express').Router();
const projectRoutes = require('./projectRoutes');

router.use('/projects', projectRoutes);

module.exports = router;
