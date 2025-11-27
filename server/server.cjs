require('dotenv').config();
const express = require('express');
const colors = require('colors');
const connectDB = require('./configure/db');
const path = require('path');
const fs = require('fs'); // Import the file system module
const helmet = require('helmet');
const { errorHandler } = require('./middleware/errorMiddleware');

const parseTrustProxy = (rawValue) => {
    if (!rawValue) return undefined;

    const value = rawValue.trim().toLowerCase();

    if (value === 'true') return true;
    if (value === 'false') return false;

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;

    return rawValue.trim();
};

const buildCorsMiddleware = (originConfig, allowAll) => {
    if (originConfig === false) {
        return (req, res, next) => {
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }

            next();
        };
    }

    const normalizeOrigin = (origin) => origin?.toLowerCase();

    return (req, res, next) => {
        const requestOrigin = req.headers.origin;

        const allowedOrigin =
            allowAll || originConfig === '*'
                ? '*'
                : originConfig.find((origin) => normalizeOrigin(origin) === normalizeOrigin(requestOrigin))
                  ? requestOrigin
                  : null;

        if (allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
            res.setHeader('Vary', 'Origin');
            res.setHeader(
                'Access-Control-Allow-Methods',
                'GET,HEAD,PUT,PATCH,POST,DELETE'
            );
            res.setHeader(
                'Access-Control-Allow-Headers',
                req.headers['access-control-request-headers'] || 'Content-Type, Authorization'
            );
            res.setHeader('Access-Control-Max-Age', '600');
        }

        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }

        next();
    };
};

const bootstrap = async () => {
    const { default: rateLimit } = await import('express-rate-limit');

    connectDB();

    const app = express();
    const PORT = process.env.PORT || 5000;

    app.disable('x-powered-by');

    const trustProxyConfig = parseTrustProxy(process.env.TRUST_PROXY);

    if (trustProxyConfig === undefined) {
        app.set('trust proxy', false);
        console.warn(
            'TRUST_PROXY is not set. X-Forwarded-* headers will be ignored to prevent spoofing. ' +
                'Set TRUST_PROXY to a known proxy hop value when running behind a trusted reverse proxy.'
        );
    } else {
        app.set('trust proxy', trustProxyConfig);
    }

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
    });

    const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
        : [];
    const allowAllCors = !corsOrigins.length && process.env.NODE_ENV !== 'production';
    const corsOriginConfig = allowAllCors ? '*' : corsOrigins.length ? corsOrigins : false;

    if (!allowAllCors && !corsOrigins.length) {
        console.warn('CORS is disabled because CORS_ORIGIN is not configured.');
    }

    app.use(helmet());
    const corsMiddleware = buildCorsMiddleware(corsOriginConfig, allowAllCors);
    app.use(corsMiddleware);
    app.use(limiter);
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
        app.get('/', (req, res) =>
            res.send('API is running. Client build files not found or NODE_ENV not set to production.')
        );
    }

    app.use(errorHandler);

    app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
};

bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
