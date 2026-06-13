import React, { useCallback, useContext, createContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

const getApiBaseUrl = () => (import.meta.env.VITE_API_URL || 'https://syzmeku-api.onrender.com').replace(/\/+$/, '');

const parseJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;

  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch (_error) {
    return null;
  }
};

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    localStorage.removeItem('user');
    return null;
  }
};

const getStoredToken = (user = null) => user?.token || localStorage.getItem('token') || '';

const clearStoredAuth = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const persistAuthPayload = (payload) => {
  if (!payload) return null;

  const token = payload.token || payload.accessToken || '';
  const role = payload.role || localStorage.getItem('user_role') || 'user';
  const normalizedUser = {
    ...payload,
    username: payload.username || payload.email?.split('@')[0] || 'OPERATOR',
    token,
    role,
    mirrorMode: payload.mirrorMode || { origin: 'user' },
  };

  localStorage.setItem('user', JSON.stringify(normalizedUser));
  if (token) localStorage.setItem('token', token);
  localStorage.setItem('user_role', role);
  return normalizedUser;
};

const tokenNeedsRefresh = (token) => {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return true;
  return (payload.exp * 1000) - Date.now() <= TOKEN_REFRESH_WINDOW_MS;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const baseUrl = getApiBaseUrl();

  const persistUser = useCallback((payload) => {
    const normalizedUser = persistAuthPayload(payload);
    setUser(normalizedUser);
    return normalizedUser;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const getToken = useCallback(() => getStoredToken(user || getStoredUser()), [user]);

  const refreshSession = useCallback(async () => {
    const token = getStoredToken(user || getStoredUser());
    if (!token) {
      logout();
      return null;
    }

    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      logout();
      return null;
    }

    return persistUser(data);
  }, [baseUrl, logout, persistUser, user]);

  const ensureValidSession = useCallback(async () => {
    const token = getStoredToken(user || getStoredUser());
    if (!token) return null;

    if (!tokenNeedsRefresh(token)) {
      return token;
    }

    const refreshedUser = await refreshSession();
    return getStoredToken(refreshedUser);
  }, [refreshSession, user]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const storedUser = getStoredUser();
      const token = getStoredToken(storedUser);

      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      const payload = parseJwtPayload(token);
      if (!payload?.exp || payload.exp * 1000 <= Date.now()) {
        const refreshedUser = await refreshSession().catch(() => null);
        if (!cancelled && refreshedUser) setUser(refreshedUser);
      } else {
        const normalized = persistAuthPayload(storedUser || { token });
        if (!cancelled) setUser(normalized);
      }

      if (!cancelled) setLoading(false);
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const login = async (email, password) => {
    if (!baseUrl) {
      throw new Error('API URL is not configured.');
    }

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || data.message || 'Login failed');
    }

    return persistUser(data);
  };

  const signup = async (username, email, password) => {
    if (!baseUrl) {
      throw new Error('API URL is not configured.');
    }

    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || data.message || 'Signup failed');
    }

    return persistUser(data);
  };

  const value = useMemo(() => ({
    user,
    loading,
    login,
    signup,
    logout,
    getToken,
    refreshSession,
    ensureValidSession,
    isAuthenticated: Boolean(getStoredToken(user)),
  }), [ensureValidSession, getToken, loading, logout, refreshSession, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const defaultAuthContext = {
  user: null,
  loading: true,
  login: async () => null,
  signup: async () => null,
  logout: () => {},
  getToken: () => null,
  refreshSession: async () => null,
  ensureValidSession: async () => null,
  isAuthenticated: false,
};

export const useAuth = () => {
  return useContext(AuthContext) ?? defaultAuthContext;
};
