require('dotenv').config();
const express = require('express');
const colors = require('colors');
const connectDB = require('./configure/db');
const path = require('path');
const { errorHandler } = require('./middleware/errorMiddleware');

connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check route - this will now be the main working route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'API is running' });
});

// app.use('/api/users', require('./routes/userRoutes'));
// app.use('/api/goals', require('./routes/goalRoutes'));

// REMOVED THE ENTIRE PRODUCTION/CLIENT SERVING LOGIC

// Default route for non-production environments and the root route (/)
app.get('/', (req, res) => res.send('API is running. Set to production to serve client.'));

app.use(errorHandler);

app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
