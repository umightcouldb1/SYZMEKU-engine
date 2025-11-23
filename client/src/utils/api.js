// File: client/src/utils/api.js
import axios from 'axios';

const apiClient = axios.create({
    baseURL: '/api', 
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
