// server/config/connection.js

const mongoose = require('mongoose');

// MONGODB_URI is read from the environment variables set in the Render dashboard.
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/syzmekuDB', {
  // These options are necessary for Mongoose to connect without errors
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

module.exports = mongoose.connection;
