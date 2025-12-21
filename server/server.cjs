const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

// Load secrets from Render environment
dotenv.config();

const app = express();

// --- INTERNAL DATABASE CONNECTION ---
// This bypasses the missing './config/db' file error
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MEMORY GRID CONNECTED (MONGODB)');
  } catch (err) {
    console.error(`DATABASE ERROR: ${err.message}`);
    process.exit(1);
  }
};
connectDB();

app.use(express.json());
app.use(cors());

// --- PRODUCTION SERVING LOGIC (THE WHITE SCREEN FIX) ---
// Serve the static files from the React dist folder
const __dirname_path = path.resolve();
const distPath = path.join(__dirname_path, 'client/dist');
app.use(express.static(distPath));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));

// The Catch-All: Serve index.html for any request that isn't an API
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON ${PORT}`));
