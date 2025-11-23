const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 5000;

// --- A. MIDDLEWARE & API ROUTES ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); 

// 💡 We are keeping the routes but they will now use the MOCKED versions below
app.use('/api/auth', require('./routes/API/authRoutes')); 
app.use('/api/projects', require('./routes/API/projectRoutes')); 


// --- B. SERVE CLIENT/FRONTEND ---
const CLIENT_BUILD_PATH = path.join(__dirname, '..', 'client', 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_BUILD_PATH));
}

// Catch-all: For any client-side route, serve the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.resolve(CLIENT_BUILD_PATH, 'index.html'));
});


// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
