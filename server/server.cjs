const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

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

// Serve static assets from the client/dist folder
const distPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(distPath));

// API Routes
let routesPath;
try {
  const routes = require(path.resolve(__dirname, 'routes/index.js'));
  app.use('/api', routes);
  console.log('API PATHWAYS ESTABLISHED');
} catch (err) {
  console.error('CRITICAL: API blueprints missing from server/routes/');
  try {
    app.use('/api/auth', require(path.resolve(__dirname, 'routes/authRoutes')));
    console.log('API PATHWAYS ESTABLISHED (AUTH FALLBACK)');
  } catch (fallbackError) {
    console.error('CRITICAL: Auth routes missing from server/routes/');
  }
}

// Catch-all to serve React UI
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Sovereign Service
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON ${PORT}`));
