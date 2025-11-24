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

// New route added to ensure the server remains active and responsive
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'API is running' });
});

// app.use('/api/users', require('./routes/userRoutes'));
// app.use('/api/goals', require('./routes/goalRoutes'));

// Serve client build folder in production
if (process.env.NODE_ENV === 'production') {
    const parentDir = path.resolve(__dirname, '..');
    const clientPath = path.join(parentDir, 'client', 'dist');

    app.use(express.static(clientPath));

    app.get('*', (req, res) => {
        res.sendFile(path.join(clientPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => res.send('Please set to production'));
}

app.use(errorHandler);

app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
