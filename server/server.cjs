// server/server.cjs
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env

const routes = require('./routes'); // <<<-- Import API routes
const { User, Project } = require('./models'); // <<<-- Import Models for initial setup (if needed)

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection string from environment variable or default
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
    .then(() => {
        console.log('MongoDB connection successful');

        // --- API ROUTES ---
        // Use the imported routes. All routes defined in server/routes/index.js
        // will be accessible. The /api prefix is set inside server/routes/index.js.
        app.use(routes);
        
        // --- STATIC FILE SERVING (CRITICAL FOR MERN DEPLOYMENT) ---
        if (process.env.NODE_ENV === 'production') {
            // 1. Serve any static files from the client/dist folder (where the React build is)
            app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

            // 2. All remaining requests (not caught by API routes) return the React app's index.html
            app.get('*', (req, res) => {
                res.sendFile(path.resolve(__dirname, '..', 'client', 'dist', 'index.html'));
            });
        }
        
        // Start the server ONLY after the database connection is open
        app.listen(PORT, () => {
            console.log(`API server running on port ${PORT}!`);
            console.log(`Using environment: ${process.env.NODE_ENV || 'development'}`);
        });

    })
    .catch(err => console.error('MongoDB connection error:', err));
