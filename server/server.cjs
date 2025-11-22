const express = require('express');
const path = require('path');
const db = require('./configure/connection'); 
const routes = require('./routes'); // Assuming you have a routes index

const app = express();
const PORT = process.env.PORT || 3001;

// Define middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve up static assets
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  // Wildcard GET request for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Use API Routes
app.use(routes);

// Start the server only after the database connection is open
db.once('open', () => {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
  });
});
