import React, { useState, useContext, createContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || 'Login failed');
    }

    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
  };

  const signup = async (username, email, password) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || 'Signup failed');
    }

    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
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

export const useAuth = () => {
  return useContext(AuthContext);
};
