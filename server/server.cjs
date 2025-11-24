// --- FILE: server/server.cjs (COMPLETE) ---
const path = require('path');
const express = require('express');
const colors = require('colors');
const dotenv = require('dotenv').config();

// Connect to MongoDB
const connectDB = require('./configure/db'); // Import DB connection function
connectDB(); // Execute DB connection

const port = process.env.PORT || 5000;

const app = express();

// Middleware for body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- API Routes ---
// The middleware and controller dependencies are loaded when these routes are required
try {
    app.use('/api/auth', require('./routes/API/authRoutes'));
    app.use('/api/projects', require('./routes/API/projectRoutes'));
    console.log('API Routes loaded successfully.');
} catch (e) {
    // This catches critical module loading errors at startup
    console.log(`CRITICAL: Failed to load projectRoutes. ${e.message}`);
}

// --- Serve Frontend ---
// This serves the static client files when deployed
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

// Check if the client build exists before serving
if (require('fs').existsSync(clientBuildPath)) {
    // Set static folder
    app.use(express.static(clientBuildPath));

    // For any request not matching an API route, serve the index.html (React app)
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(clientBuildPath, 'index.html'));
    });
} else {
    // Fallback for development/missing build
    app.get('/', (req, res) => {
        res.send('Backend is running, but client build is missing or not deployed.');
    });
}

// Fallback Error Handler (if not already defined)
app.use(require('./middleware/errorMiddleware').errorHandler);


app.listen(port, () => {
    console.log(`Server running and guaranteed to be listening on port ${port}`);
});
