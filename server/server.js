// Import necessary modules
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

// Initialize the express application
const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB connection setup (replace with your actual MongoDB URI)
const dbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/syzmeku_db';

mongoose.connect(dbUri)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Example API route
app.get('/api/status', (req, res) => {
  res.json({ message: 'SYZMEKU API is running!' });
});

// Production deployment check (serving the client's static files)
// If the app is deployed (NODE_ENV is production), serve the built client files
if (process.env.NODE_ENV === 'production') {
  // We assume the client build is placed in the 'client/dist' folder after build
  app.use(express.static('client/dist'));

  // Serve the index.html file for any unknown routes (for client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'dist', 'index.html'));
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Open API at http://localhost:${PORT}/api/status`);
});
