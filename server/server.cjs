const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

// Load Sovereign Secrets
dotenv.config();

// Ignite Memory Grid (Database)
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

// Initialize Engine (ONLY ONCE)
const app = express();

app.use(express.json());
app.use(cors());

// --- PRODUCTION BRIDGE (The White Screen Fix) ---
const distPath = path.join(path.resolve(), 'client/dist');
app.use(express.static(distPath));

// API Routes
let routesPath;
try {
  routesPath = path.resolve(__dirname, './routes/index.js');
  app.use('/api', require(routesPath));
} catch (e) {
  console.error('CRITICAL: Routes not found at', routesPath);
}

// Catch-All: Directs all web traffic to the React interface
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Sovereign Service
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON ${PORT}`));
