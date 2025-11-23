const express = require('express');
const app = express();
const path = require('path');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;

// --- A. MIDDLEWARE & API ROUTES (CRITICAL ORDER) ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// SAFEGUARD: Use try...catch blocks to guarantee the server starts, even if a route file fails to load.
try {
    app.use('/api/auth', require('./routes/API/authRoutes')); 
} catch (error) {
    console.error('CRITICAL: Failed to load authRoutes. Server is running without auth API.', error);
}

try {
    app.use('/api/projects', require('./routes/API/projectRoutes'));
} catch (error) {
    console.error('CRITICAL: Failed to load projectRoutes. Server is running without project API.', error);
}

// --- B. SERVE CLIENT/FRONTEND ---
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

// Serve the static client build
app.use(express.static(CLIENT_BUILD_PATH));

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res) => {
    // Send index.html, which is the necessary fallback for the client application
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running and guaranteed to be listening on port ${PORT}`);
});
