// server/server.cjs
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection string from environment variable or default
// Assuming your connection logic uses MONGODB_URI or a direct connection
const dbURI = process.env.MONGODB_URI;

// NOTE: You must ensure your actual MongoDB connection logic is here.
// Based on previous files, your logic was structured differently (db.once('open')).
// I'm providing a common Mongoose connect structure for completeness.

mongoose.connect(dbURI)
    .then(() => {
        console.log('MongoDB connection successful');
        
        // --- API ROUTES ---
        // Dedicated API test route that the client will now call.
        app.get('/api', (req, res) => {
            res.json({ message: "Full Stack is Live! API and Client are connected." });
        });

        // --- STATIC FILE SERVING (CRITICAL FOR MERN DEPLOYMENT) ---
        if (process.env.NODE_ENV === 'production') {
            // 1. Serve any static files from the client/dist folder (where the React build is)
            // path.join resolves the absolute path to /server/../client/dist
            app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

            // 2. All remaining requests (like user refresh, /about, /dashboard) return the React app's index.html
            // This allows React Router to handle the client-side routing.
            // NOTE: Using path.resolve here for robustness on various systems.
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
