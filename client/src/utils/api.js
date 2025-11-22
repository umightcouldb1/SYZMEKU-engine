// File: client/src/utils/api.js

// Determine the base URL from the environment variable.
// It should be 'https://syzmeku-api.onrender.com' in production.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Generic fetch wrapper for API calls.
 * @param {string} endpoint - The path (e.g., 'projects', 'users') - DO NOT include the leading '/api/'
 * @param {string} method - The HTTP method ('GET', 'POST', etc.)
 * @param {object} body - The request body object (optional)
 * @returns {Promise<object>} The parsed JSON data.
 */
export async function apiClient(endpoint, method = 'GET', body = null) {
    // Construct the full URL: Base URL + /api/ + endpoint
    // Example: https://syzmeku-api.onrender.com/api/projects
    const url = `${API_BASE_URL}/api/${endpoint}`; 

    const defaultHeaders = {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${localStorage.getItem('token')}` // For future authentication
    };

    const options = {
        method: method,
        headers: {
            ...defaultHeaders,
        },
    };

    if (body) {
        // Convert body object to JSON string
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            let errorBody = await response.text(); 
            
            try {
                // Try to parse error message if it's JSON
                errorBody = JSON.parse(errorBody);
            } catch (e) {
                // If not JSON, use the raw text
            }
            
            throw new Error(`HTTP error! Status: ${response.status}. Message: ${JSON.stringify(errorBody)}`);
        }

        // Handle responses with no content (e.g., DELETE, 204)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }

        // Return the parsed JSON response
        return await response.json();
    } catch (error) {
        console.error('API Client Error:', error);
        throw error;
    }
}
