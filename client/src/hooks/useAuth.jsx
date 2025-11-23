import React, { useState, useContext, createContext, useEffect } from 'react';

// 1. Create Auth Context
const AuthContext = createContext(null);

// 2. Auth Provider Component (Contains JSX, thus requires .jsx extension)
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user data from localStorage on initial load
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

    // Success
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

    // Success (automatically logs in the new user)
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

// 3. Custom Hook to use the Auth Context
export const useAuth = () => {
  return useContext(AuthContext);
};
