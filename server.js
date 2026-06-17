const express = require('express');
const mongoose = require('mongoose');
const missionRouter = require('./routes/mission');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/SYZMEKU', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Middleware to parse JSON bodies
app.use(express.json());

// Use the mission router at /api/mission path
app.use('/api/mission', missionRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});