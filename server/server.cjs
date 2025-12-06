// server/server.cjs - FINAL RESOLVED, SECURED, AND PATH-CORRECTED VERSION

const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv').config();
require('colors'); 

// --- 1. CORE IMPORTS ---
const connectDB = require('./configure/db'); 
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
// PATH CORRECTION: CORRECTED to point to the 'API' subfolder to fix the crash.
const fixesRoutes = require('./routes/API/fixesRoutes'); 

// --- 2. SECURITY IMPORTS ---
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize'); 

const PORT = process.env.PORT || 5000;
const app = express();

// --- START BOOTSTRAP FUNCTION ---
const bootstrap = async () => {
    await connectDB();

    // SERVER CONFIGURATION AND SECURITY MIDDLEWARE SETUP

    // Trust Proxy Logic 
    const trustProxyConfig = process.env.NODE_ENV === 'production' ? 1 : false;
    app.set('trust proxy', trustProxyConfig);
    if (!trustProxyConfig) {
        console.warn('TRUST PROXY is not set. X-Forwarded headers will be ignored to prevent spoofing.');
    }

    // Rate Limiting 
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests. Crystalline integrity check enforced. Try again in 15 minutes.'
    });

    // CORS Configuration (Uses standard middleware now)
    const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
        : [];
    const corsOptions = {
        origin: corsOrigins.length ? corsOrigins : process.env.NODE_ENV !== 'production', 
        credentials: true,
    };
    if (!corsOrigins.length && process.env.NODE_ENV !== 'production') {
        console.warn('CORS is fully open for development. Set CORS_ORIGIN in production.');
    } else if (!corsOrigins.length) {
         console.warn('CORS is disabled because CORS_ORIGIN is not configured.');
    }


    // 3. MIDDLEWARE CHAIN (ORDER IS CRITICAL)

    // A. HTTP Headers Security
    app.use(helmet()); 
    
    // B. CORS Implementation
    app.use(cors(corsOptions)); 
    
    // C. Mongo Sanitize: Prevents MongoDB Operator Injection
    app.use(mongoSanitize());
    
    // D. Rate Limiting Implementation
    app.use(limiter); 
    
    // E. Body Parsers 
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false, limit: '1mb' }));

    // Health check route 
    app.get('/api/health', (req, res) => {
        res.status(200).json({ status: 'API is running' });
    });

    // 4. ROUTE DEFINITIONS
    // Use the API subfolder path for all routes.
    // app.use('/api/users', require('./routes/API/userRoutes')); 
    // app.use('/api/goals', require('./routes/API/goalRoutes')); 
    app.use('/api/fixes', fixesRoutes); // The Crystalline Fixes Protocol is now integrated

    // 5. CLIENT BUILD SERVING LOGIC 
    const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

    if (process.env.NODE_ENV === 'production' && fs.existsSync(clientBuildPath)) {
        app.use(express.static(clientBuildPath));
        app.get('', (req, res) =>
            res.sendFile(path.join(clientBuildPath, 'index.html'))
        );
    } else {
        app.get('/', (req, res) =>
            res.send('API is running. Client build files not found or NODE_ENV not set to production.')
        );
    }
    
    // 6. ERROR HANDLERS (Must be at the very bottom)
    app.use(notFound);
    app.use(errorHandler);


    app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
};

bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
