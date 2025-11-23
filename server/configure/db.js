// --- FILE: server/configure/db.js ---
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Fallback added to ensure connection attempt even if env var is missing
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/project_db_name';
        
        const conn = await mongoose.connect(uri);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        // Exit process if connection fails
        console.error(`Error: MongoDB Connection Failed: ${error.message}`);
        // This is a critical failure, we exit the process
        process.exit(1);
    }
};

module.exports = connectDB;
