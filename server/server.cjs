// File: server/server.cjs
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const projectRoutes = require('./routes/projectRoutes');

const app = express();
const PORT = process.env.PORT || 10000;

// --- Database Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/syzmeku';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connection successful'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Middleware ---
app.use(express.json());

// FIX 1: Configure CORS to allow access from the deployed client domain.
// Use your specific Render URL for the client here.
const clientOrigin = 'https://syzmeku-api.onrender.com'; // Use the same domain for the client

const corsOptions = {
    origin: clientOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));


// --- API Routes ---
app.use('/api/projects', projectRoutes); // Use a distinct prefix for API routes

// --- Static File Serving (Crucial Fix for Client-Side Crash) ---

// FIX 2: Serve the production build of the client.
const clientPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientPath));

// FIX 3: Catch-all handler to serve the client's index.html for any non-API route.
// This is necessary for client-side routing (React Router).
app.get('*', (req, res) => {
    // Check if the request is for an API route; if so, skip sending index.html
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(clientPath, 'index.html'));
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}!`);
});
