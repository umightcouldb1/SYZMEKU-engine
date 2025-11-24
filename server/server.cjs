require('dotenv').config();
const express = require('express');
const colors = require('colors');
const connectDB = require('./configure/db');
const path = require('path');
const { errorHandler } = require('./middleware/errorMiddleware');

connectDB(); // Connect to MongoDB

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware for handling raw JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define API routes
// app.use('/api/users', require('./routes/userRoutes')); // Enable these once routes are created
// app.use('/api/goals', require('./routes/goalRoutes'));

// Serve client build folder in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));

    app.get('*', (req, res) =>
        res.sendFile(path.resolve(__dirname, '../', 'client', 'dist', 'index.html'))
    );
} else {
    // Basic route for non-production environments
    app.get('/', (req, res) => res.send('Please set to production'));
}

// Error Handler Middleware must be last
app.use(errorHandler);

app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
