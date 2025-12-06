// server/server.cjs - FINAL RESOLVED, SECURED, AND AXIOM-INTEGRATED VERSION

const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv').config();
require('colors'); 

// --- 1. CORE IMPORTS ---
const connectDB = require('./configure/db'); 
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const fixesRoutes = require('./routes/fixesRoutes'); // Your new Crystalline Route

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

    // Trust Proxy Logic (from lines 107-112)
    const trustProxyConfig = process.env.NODE_ENV === 'production' ? 1 : false;
    app.set('trust proxy', trustProxyConfig);
    if (!trustProxyConfig) {
        console.warn('TRUST PROXY is not set. X-Forwarded headers will be ignored to prevent spoofing.');
    }

    // Rate Limiting (from lines 114-119)
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests. Crystalline integrity check enforced. Try again in 15 minutes.'
    });

    // CORS Configuration (Cleaned up and using the standard 'cors' package)
    const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
        : [];
    const corsOptions = {
        // Allows origins defined in env or, if not set, allows all in non-production for dev ease
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
    
    // C. Mongo Sanitize: Prevents MongoDB Operator Injection (CRITICAL FOR DATABASE SECURITY)
    app.use(mongoSanitize());
    
    // D. Rate Limiting Implementation
    app.use(limiter); 
    
    // E. Body Parsers (from lines 135-136)
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false, limit: '1mb' }));

    // Health check route (from lines 138-141)
    app.get('/api/health', (req, res) => {
        res.status(200).json({ status: 'API is running' });
    });

    // 4. ROUTE DEFINITIONS
    // app.use('/api/users', require('./routes/userRoutes'));
    // app.use('/api/goals', require('./routes/goalRoutes'));
    app.use('/api/fixes', fixesRoutes); // The Crystalline Fixes Protocol

    // 5. CLIENT BUILD SERVING LOGIC (from lines 144-163)
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
