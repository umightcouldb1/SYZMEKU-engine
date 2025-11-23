// --- FILE: server/middleware/errorMiddleware.js (CLEANED) ---
const notFound = (req, res, next) => {
    // This runs if no other route (API or client catch-all) handled the request
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error); // Pass the error to the errorHandler
};

const errorHandler = (err, req, res, next) => {
    // If the status code is 200 (OK), it means an error occurred but we didn't explicitly set a status.
    // We default to 500 (Server Error). Otherwise, we use the status set earlier.
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);

    res.json({
        message: err.message,
        // Only include the stack trace in development for security
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = {
    notFound,
    errorHandler,
};
