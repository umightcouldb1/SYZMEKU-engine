// File: client/src/utils/api.js
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiClient(endpoint, method = 'GET', data = null) {
    const url = `${BASE_URL}/api/${endpoint}`;
    
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (data) {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Request failed (could not parse error body)' }));
            throw new Error(`API Error (${response.status} ${response.statusText}): ${errorData.message || 'Request failed'}`);
        }

        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return {};
        }

        return await response.json();
    } catch (error) {
        console.error('API Client Error:', error);
        throw error;
    }
}
