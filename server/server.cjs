const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

// Connect to the Memory Grid (MongoDB)
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/fixes', require('./routes/fixesRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));

// --- PRODUCTION SERVING LOGIC (THE WHITE SCREEN FIX) ---

// 1. Point to the compiled React assets
app.use(express.static(path.join(__dirname, '../client/dist')));

// 2. The Catch-All: Serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

// --- END PRODUCTION LOGIC ---

// Sovereign Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON PORT ${PORT}`));
