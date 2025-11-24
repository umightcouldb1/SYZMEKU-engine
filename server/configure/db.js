const mongoose = require('mongoose');
const colors = require('colors'); 

const connectDB = async () => {
    try {
        // Ensure your MONGO_URI is set as an environment variable on Render
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
    } catch (error) {
        console.error(`Error: ${error.message}`.red.underline.bold);
        process.exit(1); 
    }
};

module.exports = connectDB;
