const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// --- 1. CRITICAL ENVIRONMENT VARIABLE CHECK & SETUP ---
// This simplified check only requires the MongoDB URI and JWT Secret.
const MONGO_URI = process.env.MONGODB_URI || process.env.ATLAS_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI || !JWT_SECRET) {
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
const PORT = process.env.PORT || 3001; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// Production Static Asset Setup
// ----------------------------------------------------
if (process.env.NODE_ENV === 'production') {
    // Serve any static files from the client's build directory
    app.use(express.static(path.join(__dirname, '../client/dist')));

    // Catch-all route handler for the front-end (sends the index.html)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
}
// ----------------------------------------------------

// 3. Database Connection and Server Start
mongoose.connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ API server running on port ${PORT}!`);
      console.log(`✅ MongoDB Connection Successful!`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error or server startup failed:", err.message);
    process.exit(1);
  });
