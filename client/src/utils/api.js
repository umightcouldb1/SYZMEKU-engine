// File: client/src/utils/api.js
import axios from 'axios';

// FIX: Set the baseURL to the API route prefix used in server/server.cjs.
// This works for both local development and Render deployment (same domain).
const apiClient = axios.create({
    baseURL: '/api', // Correct prefix to hit the Express API routes
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
