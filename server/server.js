require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadArchitectBaseTone } = require('./logic/architectLayer');
const { initializeAdminSystem } = require('./utils/adminIdentity');

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
    await initializeAdminSystem();
  } catch (err) {
    console.error(`[SYS_ERR] Database connection failed: ${err.message}`);
  }
};
connectDB();

// ==========================================
// PHASE III SECURITY LAYER INTEGRATION
// ==========================================
const defaultProductionOrigins = [
  'https://www.toisouljahacademy.com',
  'https://syzmeku-engine.vercel.app',
  'https://syzmeku-api.onrender.com',
];
const defaultDevelopmentOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const configuredClientOrigins = String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const fallbackClientOrigins = process.env.NODE_ENV === 'production'
  ? defaultProductionOrigins
  : [...defaultDevelopmentOrigins, ...defaultProductionOrigins];
const allowedClientOrigins = Array.from(new Set([
  ...configuredClientOrigins,
  ...fallbackClientOrigins,
]));

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedClientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed.'));
  },
};

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", 'https://syzmeku-api.onrender.com', 'https://accounts.google.com'],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.google.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(cors(corsOptions));

// Stripe signature verification requires the untouched raw request body.
const stripeWebhookRoutes = require(path.resolve(__dirname, 'routes/webhook'));
app.use('/api/webhooks', stripeWebhookRoutes);
app.use('/webhook', stripeWebhookRoutes);

app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 100),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

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
