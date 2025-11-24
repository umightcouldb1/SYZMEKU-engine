// --- FILE: server/configure/db.js ---
const mongoose = require('mongoose');
const colors = require('colors'); // Optional dependency for colored logging

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        // Success message
        console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
    } catch (error) {
        // Failure message
        console.error(`Error: ${error.message}`.red.underline.bold);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;
