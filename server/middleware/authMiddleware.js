// MOCKED AUTH MIDDLEWARE: This bypasses all database-related checks to prevent server crashes.

const protect = (req, res, next) => {
    // Allows all requests to proceed and attaches a mock user object.
    req.user = { id: 'MOCKED_ID', username: 'MOCKED_USER' };
    next();
};

module.exports = protect;
