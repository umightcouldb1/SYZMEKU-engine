// server/configure/connection.js
const mongoose = require('mongoose');
// Load environment variables for local development
require('dotenv').config();

const uri = process.env.MONGODB_URI;

// Connect to MongoDB. Mongoose v6+ automatically handles necessary options.
// Deprecated options (useNewUrlParser, useUnifiedTopology) are removed to clear warnings.
mongoose
  .connect(uri)
  .then(() => {
    console.log('MongoDB connection successful');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

module.exports = mongoose.connection;
