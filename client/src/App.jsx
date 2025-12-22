import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import RequireAuth from './components/RequireAuth';
import PrivateLayout from './layouts/PrivateLayout';

function App() {
  const auth = useSelector((state) => state.auth || {});
  const user = auth.user || null;
  let storedUser = null;

  try {
    storedUser = JSON.parse(localStorage.getItem('user'));
  } catch (error) {
    storedUser = null;
  }

  const resolvedUser = user || storedUser;
  const isLoading = auth.isLoading || false;

  if (isLoading) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<AuthScreen />} />
      <Route
        element={
          <RequireAuth>
            <PrivateLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard user={resolvedUser} />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
