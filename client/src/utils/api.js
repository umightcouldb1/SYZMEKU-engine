import { useAuth } from '../hooks/useAuth';

// Base URL from your Render environment variable
const BASE_URL = import.meta.env.VITE_API_URL;

// Custom fetch wrapper to attach JWT token for authenticated requests
const useApi = () => {
    const { getToken, logout } = useAuth();

    const authorizedFetch = async (endpoint, options = {}) => {
        const token = getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });

        // Handle 401 Unauthorized (Token expired or invalid)
        if (response.status === 401) {
            logout(); // Force log out
            // You could throw an error here to stop the component logic
        }

        return response;
    };

    return { authorizedFetch };
};

export default useApi;
