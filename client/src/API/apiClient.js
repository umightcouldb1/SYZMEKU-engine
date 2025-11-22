// File: client/src/api/apiClient.js
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Core API utility client for making requests to the Express backend.
 * @param {string} endpoint - The API endpoint (e.g., 'projects' or 'projects/123').
 * @param {string} method - The HTTP method (GET, POST, PUT, DELETE).
 * @param {object} [data=null] - The request body data for POST/PUT requests.
 * @returns {Promise<object>} The JSON response data.
 */
export async function apiClient(endpoint, method = 'GET', data = null) {
    // The endpoint is typically prefixed with '/api/' on the server side
    const url = `${BASE_URL}/api/${endpoint}`;
    
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
            // Add Authorization headers here later when auth is implemented
        },
    };

    if (data) {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, config);

        // Check if the request was successful (status code 200-299)
        if (!response.ok) {
            // Attempt to parse error data from the response body
            const errorData = await response.json().catch(() => ({ message: 'Request failed (could not parse error body)' }));
            throw new Error(`API Error (${response.status} ${response.statusText}): ${errorData.message || 'Request failed'}`);
        }

        // Return empty object if no content (e.g., 204 No Content for DELETE)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return {};
        }

        return await response.json();
    } catch (error) {
        // Re-throw the error for the calling component to handle
        console.error('API Client Error:', error);
        throw error;
    }
}
