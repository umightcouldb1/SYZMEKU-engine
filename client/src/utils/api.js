// client/src/utils/api.js - Replace the entire file contents
import axios from 'axios';

// Determine the base URL dynamically
let baseURL = 'http://localhost:3001'; // Default for local development

if (process.env.NODE_ENV === 'production') {
  // Use the deployed Render URL for production.
  // NOTE: This URL should match the 'Available at your primary URL' log entry.
  baseURL = 'https://syzmeku-api.onrender.com';
}

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  // If you are sending cookies or session info, include:
  // withCredentials: true,
});

export default apiClient;
