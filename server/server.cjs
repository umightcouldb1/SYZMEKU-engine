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

// Health check route - confirm API is working
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'API is running' });
});

// app.use('/api/users', require('./routes/userRoutes'));
// app.use('/api/goals', require('./routes/goalRoutes'));

// Re-enabling the static file serving for production
if (process.env.NODE_ENV === 'production') {
    // Set static folder to client/dist
    app.use(express.static(path.join(__dirname, '../client/dist')));

    // For any non-API route, serve the index.html file
    app.get('*', (req, res) =>
        res.sendFile(path.resolve(__dirname, '../', 'client', 'dist', 'index.html'))
    );
} else {
    app.get('/', (req, res) => res.send('Please set to production'));
}

app.use(errorHandler);

app.listen(PORT, () => console.log(`Server started on port ${PORT}`.yellow));
