// server/server.js

// --- Dependencies ---
const express = require('express');
const path = require('path');
// This line REQUIRES the connection file we are creating next (server/config/connection.js)
const db = require('./config/connection'); 
const app = express();

// Set the port to use the environment variable (required by Render) or default to 3001
const PORT = process.env.PORT || 3001; 

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Serve Static Assets (for Production) ---
// This serves the built React client files located in the 'client/dist' folder.
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/dist'); 
  app.use(express.static(buildPath));

  // Catch-all handler: serves the main index.html for all non-API routes.
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// --- Database Connection and Server Start ---
// The Express server will only start listening once the database connection is open.
db.once('open', () => {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
    console.log(`Web application served in production mode.`); 
  });
});
