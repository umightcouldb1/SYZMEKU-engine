// --- Dependencies ---
// This is the starting point for your Node.js Express server.
const express = require('express');
const path = require('path');
const db = require('./config/connection'); // Assuming you have a connection file
const app = express();

// Set the port to use the environment variable (required by Render) or default to 3001
const PORT = process.env.PORT || 3001; 

…  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
    console.log(`Use GraphQL at http://localhost:${PORT}/graphql`); 
  });
});

// NOTE: Add your API/GraphQL routes here before the 'Database Connection' block.
// Example: app.use('/api', require('./routes/api-routes'));
