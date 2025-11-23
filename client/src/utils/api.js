// File: client/src/utils/api.js
import axios from 'axios';

// FIX: Setting the baseURL conditionally. 
// When deployed on Render (production), the client needs to explicitly 
// target the Render API URL to resolve the connection issue.

// Replace YOUR_RENDER_API_URL_HERE with the actual URL of your API service (https://syzmeku-api.onrender.com).
// For simplicity and immediate fix, we will hardcode the URL seen in your browser tabs:
const RENDER_API_URL = 'https://syzmeku-api.onrender.com';

const isProduction = process.env.NODE_ENV === 'production';
const baseURL = isProduction ? RENDER_API_URL : (import.meta.env.VITE_APP_API_URL || 'http://localhost:10000');


const apiClient = axios.create({
    baseURL: baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
