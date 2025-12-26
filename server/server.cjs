const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadArchitectBaseTone } = require('./logic/architectLayer');

dotenv.config();

const app = express();
global.toneMatrix = loadArchitectBaseTone();
app.disable('x-powered-by');
app.set('trust proxy', 1);

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

app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Serve static assets from the client/dist folder
const distPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(distPath));

// API Routes
try {
  const routesPath = path.resolve(__dirname, 'routes/index.js');
  const routes = require(routesPath);
  app.use('/api', routes);
  console.log('API PATHWAYS ESTABLISHED');
} catch (err) {
  console.error('CRITICAL: API blueprints missing from server/routes/');
  app.use('/api/auth', require(path.resolve(__dirname, 'routes/authRoutes')));
}

// Catch-all to serve React UI
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Sovereign Service
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON ${PORT}`));
