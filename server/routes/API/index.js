const router = require('express').Router();
const projectRoutes = require('./projectRoutes'); 
// const userRoutes = require('./userRoutes'); // Future use

router.use('/projects', projectRoutes);
// router.use('/users', userRoutes); // Future use

module.exports = router;
