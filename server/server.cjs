const express = require('express');
const app = express();
const path = require('path');
// Removed: dotenv, connectDB.

// --- CONFIGURATION ---

// Define the port, hardcode to 5000 as a fail-safe
const PORT = process.env.PORT || 5000;


// --- A. MIDDLEWARE & API ROUTES (CRITICAL ORDER) ---

// Essential Express middleware
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// Register MOCKED API routes 
app.use('/api/auth', require('./routes/API/authRoutes')); 
app.use('/api/projects', require('./routes/API/projectRoutes')); 


// --- B. SERVE CLIENT/FRONTEND ---

// Define the path to the built frontend (assuming client/dist)
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

// Serve the static client build
app.use(express.static(CLIENT_BUILD_PATH));

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'));
});


// Start the server
app.listen(PORT, () => {
    // If this line executes, the server is running successfully.
    console.log(`Server running on port ${PORT}`);
});
