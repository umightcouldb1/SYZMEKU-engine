// server/configure/connection.js

const mongoose = require('mongoose');

// MONGODB_URI is read from the environment variables set in the Render dashboard.
// The Mongoose connection now uses the default modern options.
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/syzmekuDB');

module.exports = mongoose.connection;
