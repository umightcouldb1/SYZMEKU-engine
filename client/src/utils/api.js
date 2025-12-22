import { useAuth } from '../hooks/useAuth.jsx';

const BASE_URL = import.meta.env.VITE_API_URL;

const useApi = () => {
    const { getToken, logout } = useAuth() ?? {};
    const safeGetToken = getToken ?? (() => null);
    const safeLogout = logout ?? (() => {});

    const authorizedFetch = async (endpoint, options = {}) => {
        const token = safeGetToken();
        
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

        if (response.status === 401) {
            safeLogout(); 
        }

        return response;
    };

    return { authorizedFetch };
};

export default useApi;
