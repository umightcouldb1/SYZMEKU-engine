const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./configure/db');
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
app.use(require('./routes'));

// --- PRODUCTION SERVING LOGIC (THE WHITE SCREEN FIX) ---
const distPath = path.join(path.resolve(), 'client/dist');
app.use(express.static(distPath));

// The Catch-All: Serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Sovereign Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SYZMEKU ENGINE ACTIVE ON PORT ${PORT}`));
