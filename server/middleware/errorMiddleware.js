// --- FILE: server/middleware/errorMiddleware.js ---
JavaScript

// Handles errors that occur during the request cycle (e.g., Mongoose validation errors)
const errorHandler = (err, req, res, next) => {
    // Check if a status code was already set by a controller, otherwise default to 500
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    res.status(statusCode);

    // Send a structured JSON response
    res.json({
        message: err.message,
        // In development, show the stack trace for debugging
        // In production, keep stack trace null for security
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

// Handles requests made to routes that don't exist
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error); // Pass the error to the errorHandler middleware
};


module.exports = {
    errorHandler,
    notFound,
};
