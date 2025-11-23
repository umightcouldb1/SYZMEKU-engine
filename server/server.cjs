// --- FILE: server/server.cjs (Final Path Guaranteed) ---
const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv').config(); 
const connectDB = require('./configure/db'); // <-- CORRECTED PATH: 'configure'
const { notFound, errorHandler } = require('./middleware/errorMiddleware'); 

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;

// CONNECT TO DATABASE
connectDB(); 

// --- A. MIDDLEWARE & API ROUTES (CRITICAL ORDER) ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// SAFEGUARD: Use try...catch blocks to guarantee the server starts.
try {
    app.use('/api/auth', require('./routes/API/authRoutes')); 
} catch (error) {
    console.error('CRITICAL: Failed to load authRoutes.', error.message);
}

try {
    app.use('/api/projects', require('./routes/API/projectRoutes'));
} catch (error) {
    console.error('CRITICAL: Failed to load projectRoutes.', error.message);
}

// --- B. SERVE CLIENT/FRONTEND ---
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

// Serve the static client build
app.use(express.static(CLIENT_BUILD_PATH));

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res, next) => {
    // Check if the request is for an API route or a client route
    if (req.originalUrl.startsWith('/api')) {
        return next(); 
    }
    
    // Serve the index.html file for client routing
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'), (err) => {
        if (err) {
            console.error("Error sending index.html:", err.message);
            res.status(500).send('<h1>Server Running: Client Build Path Error</h1><p>Check CLIENT_BUILD_PATH and client/dist directory.</p>');
        }
    });
});

// --- C. ERROR HANDLERS (MUST BE LAST) ---
app.use(notFound); 
app.use(errorHandler); 

// Start the server
app.listen(PORT, () => {
    console.log(`Server running and guaranteed to be listening on port ${PORT}`);
});
