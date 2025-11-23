// File: server/server.cjs
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// FIX: Corrected the filename case to match the file tree (projectRoutes.js)
const projectRoutes = require('./routes/API/projectRoutes.js'); 

const app = express();
const PORT = process.env.PORT || 10000;

// --- Database Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/syzmeku';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connection successful'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Middleware ---
app.use(express.json());
app.use(cors()); 

// --- API Routes ---
app.use('/api/projects', projectRoutes); 

// --- Static File Serving ---
const clientPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientPath));

// Catch-all handler for client-side routing
app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(clientPath, 'index.html'));
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
});
