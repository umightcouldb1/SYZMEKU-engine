const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv');
// ALL database-related code has been removed to prevent the crash.

// Load environment variables (if used)
dotenv.config();

// Define the port, use environment variable or default to 5000
const PORT = process.env.PORT || 5000;


// --- A. MIDDLEWARE & API ROUTES (MUST COME FIRST) ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// 💡 Register API routes BEFORE static file serving
// NOTE: authRoutes and projectRoutes will now crash when trying to access the database.
// This is expected. The goal is to get the server running to identify the next exact error.
app.use('/api/auth', require('./routes/API/authRoutes')); 
app.use('/api/projects', require('./routes/API/projectRoutes')); 


// --- B. SERVE CLIENT/FRONTEND (MUST COME AFTER API ROUTES) ---

// Define the path to the built frontend (assuming client/dist)
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

// If in production mode, serve the static client build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_BUILD_PATH));
}

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'));
});


// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
