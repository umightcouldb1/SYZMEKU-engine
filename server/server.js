const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// --- 1. CRITICAL ENVIRONMENT VARIABLE CHECK & SETUP ---
// This simple check ignores the missing Stripe and Gemini keys from your old file
// and only requires the MongoDB URI and JWT Secret, which you have set.

// Use MONGODB_URI (your current Render key) or ATLAS_URI (a common alternative).
const MONGO_URI = process.env.MONGODB_URI || process.env.ATLAS_URI;
// Use the JWT_SECRET you provided.
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI || !JWT_SECRET) {
    // Crash and report a clear error if the essential MERN keys are missing.
    console.error("CRITICAL ERROR: One or more essential environment variables are missing.");
    if (!MONGO_URI) {
        console.error("Missing Database URI. Please set MONGODB_URI or ATLAS_URI.");
    }
    if (!JWT_SECRET) {
        console.error("Missing JWT Secret. Please set JWT_SECRET.");
    }
    process.exit(1);
}

// --- 2. SERVER SETUP ---
const app = express();
// PORT will use the value in your Render environment (3001), or default to 3001.
const PORT = process.env.PORT || 3001; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// Production Static Asset Setup
// ----------------------------------------------------
// This block ensures the frontend files are served when deployed to Render
if (process.env.NODE_ENV === 'production') {
    // Serve any static files from the client's build directory
    // Assumes the client build is in '../client/dist' relative to this server.js
    app.use(express.static(path.join(__dirname, '../client/dist')));

    // Catch-all route handler for the front-end (sends the index.html)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
}
// ----------------------------------------------------

// 3. Database Connection and Server Start
// Attempt to connect to MongoDB using the URI
mongoose.connect(MONGO_URI)
  .then(() => {
    // Start the server only after the database connection is successful
    app.listen(PORT, () => {
      console.log(`✅ API server running on port ${PORT}!`);
      console.log(`✅ MongoDB Connection Successful!`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error or server startup failed:", err.message);
    process.exit(1);
  });
