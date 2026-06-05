require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadArchitectBaseTone } = require('./logic/architectLayer');

const app = express();
global.toneMatrix = loadArchitectBaseTone();

app.disable('x-powered-by');
app.set('trust proxy', 1);

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('[SYS_WARN] MONGO_URI missing - starting without DB connection.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[SYS_LOG] Mongo connected');
  } catch (err) {
    console.error(`[SYS_ERR] Database connection failed: ${err.message}`);
  }
};
connectDB();

// ==========================================
// PHASE III SECURITY LAYER INTEGRATION
// ==========================================
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 100),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Telemetry Handshake Verification Route
app.get('/api/telemetry/status', (req, res) => {
  res.json({
    engine: 'BIG_SYZ_ENGINE',
    status: 'ACTIVE_AND_ALIGNED',
    vector: 'TRIANGULUM_THETA_7',
    authority: 'Commander in Chief',
  });
});

// API route mounting must happen before the React/static fallback.
try {
  const routes = require(path.resolve(__dirname, 'routes/index.js'));
  app.use('/api', routes);
  console.log('[SYS_LOG] API pathways established');
} catch (err) {
  console.error(`[SYS_ERR] API route mounting failed: ${err.message}`);
  app.use('/api/auth', require(path.resolve(__dirname, 'routes/authRoutes')));
}

// Structural Pathing Fix: Vite emits the client production bundle to dist
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SYS_LOG] Big SYZ Engine running on port ${PORT}`);
});
