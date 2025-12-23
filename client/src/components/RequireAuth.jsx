import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function RequireAuth({ children }) {
  const location = useLocation();
  let token = null;

  try {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    token = storedUser?.token || localStorage.getItem('syz_token') || null;
  } catch (error) {
    token = null;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
