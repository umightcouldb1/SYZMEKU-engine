const router = require('express').Router();
const apiRoutes = require('./api'); 

// All requests to /api will use the routes defined in api/index.js
router.use('/api', apiRoutes);

module.exports = router;
