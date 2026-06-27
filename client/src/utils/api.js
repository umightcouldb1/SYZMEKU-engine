import { useAuth } from '../hooks/useAuth.jsx';
import { getApiBaseUrl } from '../config/apiConfig.js';

const BASE_URL = getApiBaseUrl();

export const buildApiUrl = (endpoint = '') => {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${BASE_URL}${normalizedEndpoint}`;
};

export const apiClient = async (endpoint, method = 'GET', body, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    const response = await fetch(buildApiUrl(endpoint), {
        ...options,
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || data?.error || `API request failed with ${response.status}`);
    }

    return data;
};

export const fetchTelemetryStatus = async (options = {}) => {
    const response = await fetch(buildApiUrl('/api/telemetry/status'), {
        credentials: 'include',
        ...options,
        headers: {
            Accept: 'application/json',
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Telemetry unavailable with ${response.status}`);
    }

    return data;
};

const useApi = () => {
    const { getToken, logout } = useAuth() ?? {};
    const safeGetToken = getToken ?? (() => null);
    const safeLogout = logout ?? (() => {});

    const authorizedFetch = async (endpoint, options = {}) => {
        const tokenFromContext = safeGetToken();
        const tokenFromStorage = (() => {
            try {
                const storedUser = JSON.parse(localStorage.getItem('user'));
                return storedUser?.token || null;
            } catch (error) {
                return null;
            }
        })();
        const token = tokenFromContext || tokenFromStorage;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(buildApiUrl(endpoint), {
            ...options,
            credentials: 'include',
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
