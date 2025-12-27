import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import RequireAuth from './components/RequireAuth';
import PrivateLayout from './layouts/PrivateLayout';

function App() {
  const auth = useSelector((state) => state.auth || {});
  const user = auth.user || null;
  let storedUser = null;
  const [isAscended, setIsAscended] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  try {
    storedUser = JSON.parse(localStorage.getItem('user'));
  } catch (error) {
    storedUser = null;
  }

  useEffect(() => {
    const token = storedUser?.token || localStorage.getItem('syz_token');
    setIsAscended(Boolean(token));
  }, [storedUser?.token]);

  useEffect(() => {
    if (isAscended && location.pathname === '/login') {
      navigate('/dashboard', { replace: true });
    }
  }, [isAscended, location.pathname, navigate]);

  const resolvedUser = user || storedUser;
  const isLoading = auth.isLoading || false;

  if (isLoading) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  const handleAscend = (token) => {
    if (token) {
      localStorage.setItem('syz_token', token);
    }
    setIsAscended(true);
  };

  return (
    <Routes>
      <Route path="/login" element={<AuthScreen onAscend={handleAscend} />} />
      <Route
        element={
          <RequireAuth>
            <PrivateLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard user={resolvedUser} />} />
      </Route>
      <Route path="*" element={<Navigate to={isAscended ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
