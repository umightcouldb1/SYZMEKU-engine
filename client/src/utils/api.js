// File: client/src/utils/api.js
import axios from 'axios';

// FIX: Change baseURL to connect to the rendered API service, 
// using the VITE_APP_API_URL environment variable for development/testing,
// and a simple relative path for production (Render).
const isProduction = process.env.NODE_ENV === 'production';
const baseURL = isProduction ? '/' : (import.meta.env.VITE_APP_API_URL || 'http://localhost:10000');


const apiClient = axios.create({
    baseURL: baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
