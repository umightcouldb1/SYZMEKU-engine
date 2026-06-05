require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadArchitectBaseTone } = require('./logic/architectLayer');
const { initializeAdminSystem, normalizeEmail } = require('./utils/adminIdentity');

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

// ==========================================
// TEMPORARY PHASE III MASTER FORCE OVERRIDE
// Active only while RESET_ADMIN_PASSWORD=true is configured in Render.
// ==========================================
app.get('/api/system-master-override-reset', async (_req, res) => {
  try {
    if (process.env.RESET_ADMIN_PASSWORD !== 'true') {
      return res.status(403).json({
        success: false,
        message: 'Master override is disabled. Set RESET_ADMIN_PASSWORD=true to enable it temporarily.',
      });
    }

    const bcrypt = require('bcryptjs');
    const User = require('./models/User');
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
    const targetPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();

    if (!adminEmail || !targetPassword) {
      return res.status(400).json({
        success: false,
        message: 'ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must both be configured in Render.',
      });
    }

    const admin = await User.findOne({ email: adminEmail });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: `Admin email not found in database: ${adminEmail}`,
      });
    }

    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(targetPassword, salt);
    admin.role = 'admin';
    if (admin.isVerified !== undefined) admin.isVerified = true;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: `Master override successful for ${adminEmail}. Password has been synchronized with INITIAL_ADMIN_PASSWORD. Clear RESET_ADMIN_PASSWORD after login.`,
    });
  } catch (error) {
    console.error('[SYS-INIT] Override route error:', error?.message || error);
    return res.status(500).json({ success: false, error: error?.message || 'Unknown override error' });
  }
});

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
