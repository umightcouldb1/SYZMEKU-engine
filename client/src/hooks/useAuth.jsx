import React, { useState, useContext, createContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const baseUrl = import.meta.env.VITE_API_URL;

  const persistUser = (payload) => {
    const normalizedUser = {
      username: payload.username || payload.email?.split('@')[0] || 'OPERATOR',
      token: payload.token || '',
      role: payload.role || 'user',
      mirrorMode: payload.mirrorMode || { origin: 'user' },
    };

    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    return normalizedUser;
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      persistUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    if (!baseUrl) {
      throw new Error('API URL is not configured.');
    }

    try {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.msg || 'Login failed');
      }

      return persistUser(data);
    } catch (error) {
      throw error;
    }
  };

  const signup = async (username, email, password) => {
    if (!baseUrl) {
      throw new Error('API URL is not configured.');
    }

    try {
      const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.msg || 'Signup failed');
      }

      return persistUser(data);
    } catch (error) {
      throw error;
    }
  };
  
  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const getToken = () => {
    if (user && user.token) {
        return user.token;
    }
    return null;
  };

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    getToken,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const defaultAuthContext = {
  user: null,
  loading: true,
  login: async () => null,
  signup: async () => null,
  logout: () => {},
  getToken: () => null,
  isAuthenticated: false,
};

export const useAuth = () => {
  return useContext(AuthContext) ?? defaultAuthContext;
};
