// File: server/server.cjs
const express = require('express');
const path = require('path');
const cors = require('cors');

// FIX: Changed './config/connection' to './configure/connection'
const db = require('./configure/connection');

// CRITICAL FIX: IMPORT THE ROUTES (This file will load server/routes/index.js)
const routes = require('./routes'); 

// CRITICAL CONFIGURATION
const PORT = process.env.PORT || 3001;
const app = express();

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Apply all imported routes
app.use(routes);

// PRODUCTION BUILD STEP
// Serve up static assets only in production
if (process.env.NODE_ENV === 'production') {
  // Point to the built client folder
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  // For any non-API request, serve the index.html from the built client
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Start the server ONLY when the database connection is open
db.once('open', () => {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
    console.log(`Using environment: ${process.env.NODE_ENV || 'development'}`);
  });
});
