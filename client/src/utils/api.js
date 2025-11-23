// File: client/src/utils/api.js
import axios from 'axios';

// FIX: Hardcode the absolute Render URL for API requests in production 
// to bypass potential path resolution issues.
const RENDER_API_URL = 'https://syzmeku-api.onrender.com';

const apiClient = axios.create({
    baseURL: RENDER_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
