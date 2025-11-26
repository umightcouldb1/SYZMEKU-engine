require('dotenv').config();
const express = require('express');
const colors = require('colors');
const connectDB = require('./configure/db');
const path = require('path');
const fs = require('fs'); // Import the file system module
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/errorMiddleware');

connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

const requestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

app.use(helmet());
app.use(
    cors({
        origin: corsOrigins.length ? corsOrigins : '*',
    })
);
app.use(requestLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Health check route - confirm API is working
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'API is running' });
});

// app.use('/api/users', require('./routes/userRoutes'));
// app.use('/api/goals', require('./routes/goalRoutes'));

// Define the path to the client build folder
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

// Check if the client build folder exists before serving static files
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientBuildPath)) {
    // Set static folder to client/dist
    app.use(express.static(clientBuildPath));

    // For any non-API route, serve the index.html file
    app.get('*', (req, res) =>
        res.sendFile(path.join(clientBuildPath, 'index.html'))
    );
} else {
    // Fallback route if the build files are not found or not in production
    app.get('/', (req, res) => res.send('API is running. Client build files not found or NODE_ENV not set to production.'));
}

app.use(errorHandler);

app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
