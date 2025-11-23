const express = require('express');
const app = express();
const path = require('path');
// ... other imports (database connection, port definition, etc.)

// --- A. MIDDLEWARE & API ROUTES (MUST COME FIRST) ---
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: false })); // For parsing application/x-www-form-urlencoded

// 💡 Ensure these API routes are registered BEFORE the static file serving
app.use('/api/auth', require('./routes/API/authRoutes')); 
app.use('/api/projects', require('./routes/API/projectRoutes')); 

// ... (Your error handler middleware might go here) ...


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


// ... (Bottom of file: app.listen, port definition, etc.) ...
