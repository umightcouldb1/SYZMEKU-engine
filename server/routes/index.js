const router = require('express').Router();
const apiRoutes = require('./API'); // This line is corrected to match the GitHub folder case

// All requests to /api will use the routes defined in API/index.js
router.use('/api', apiRoutes);

module.exports = router;
