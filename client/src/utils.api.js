// client/src/utils/api.js

// Determine the base URL: "/" in production (current host) or localhost in dev.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Generic fetch wrapper for API calls.
 * @param {string} endpoint - The path (e.g., '/projects', '/users')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<object>} The parsed JSON data.
 */
export async function apiFetch(endpoint, options = {}) {
  // Always prefix the endpoint with /api/
  const url = `${API_BASE_URL}/api${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    // 'Authorization': `Bearer ${localStorage.getItem('token')}`, // Add this when auth is implemented
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    // Convert body object to JSON string if it exists
    body: options.body ? JSON.stringify(options.body) : options.body,
  });

  // Throw an error if the response is not OK
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Network or server error' }));
    throw new Error(errorBody.message || `HTTP error! status: ${response.status}`);
  }

  // Handle successful response with no content (e.g., a DELETE request)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
