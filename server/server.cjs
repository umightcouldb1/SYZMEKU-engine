const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db'); // Assuming you have a database config file

// Load environment variables (if used)
dotenv.config();

// Connect to Database
connectDB(); // Execute your database connection function

// Define the port, use environment variable or default to 5000
const PORT = process.env.PORT || 5000;


// --- A. MIDDLEWARE & API ROUTES (MUST COME FIRST) ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// 💡 Register API routes BEFORE static file serving
app.use('/api/auth', require('./routes/API/authRoutes')); 
// Assuming a projects route exists, if this causes a crash, temporarily comment it out:
app.use('/api/projects', require('./routes/API/projectRoutes')); 


// --- B. SERVE CLIENT/FRONTEND (MUST COME AFTER API ROUTES) ---

// Define the path to the built frontend (assuming client/dist)
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

// If in production mode, serve the static client build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_BUILD_PATH));
}

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res) => {
    // Note: path.resolve is crucial for production environment pathing
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'));
});


// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
