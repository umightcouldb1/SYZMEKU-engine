import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    localStorage.removeItem('user');
    return null;
  }
};

export default function RequireAuth({ children, allowedRoles }) {
  const location = useLocation();
  const user = readStoredUser();
  const token = localStorage.getItem('token') || user?.token || '';
  const role = localStorage.getItem('user_role') || user?.role || 'user';

  if (!token) {
    console.warn('[SYS_AUTH] No token detected. Redirecting to initialization.');
    return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    console.warn(`[SYS_AUTH] Access denied for role: ${role}. Redirecting to fallback.`);
    return <Navigate to="/app" replace />;
  }

  return children;
}
