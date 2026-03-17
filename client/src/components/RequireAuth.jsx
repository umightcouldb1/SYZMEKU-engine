import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function RequireAuth({ children }) {
  const location = useLocation();
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    user = null;
  }

  if (!user) {
    return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  }

  return children;
}
