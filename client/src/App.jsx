import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './AuthPage';
import Dashboard from './Dashboard';
import OnboardingFlow from './OnboardingFlow';
import WelcomeScreen from './WelcomeScreen';
import RequireAuth from './components/RequireAuth';
import PrivateLayout from './layouts/PrivateLayout';
import './entryFlow.css';

const ONBOARDING_STORAGE_KEY = 'syz_onboarding_complete';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    return null;
  }
};

function App() {
  const auth = useSelector((state) => state.auth || {});
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const user = useMemo(() => auth.user || getStoredUser(), [auth.user]);
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    let cancelled = false;

    const syncOnboardingStatus = async () => {
      if (!isAuthenticated) {
        setOnboardingCompleted(false);
        setOnboardingReady(true);
        return;
      }

      setOnboardingReady(false);
      try {
        const response = await axios.get('/api/core/onboarding/status');
        if (cancelled) return;
        const completed = Boolean(response.data?.completed);
        setOnboardingCompleted(completed);
        localStorage.setItem(ONBOARDING_STORAGE_KEY, completed ? 'true' : 'false');
      } catch (_error) {
        if (cancelled) return;
        const localState = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
        setOnboardingCompleted(localState);
      } finally {
        if (!cancelled) {
          setOnboardingReady(true);
        }
      }
    };

    syncOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?._id]);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setOnboardingCompleted(true);
  };

  if (!onboardingReady) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  return (
    <Routes>
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to={onboardingCompleted ? '/app' : '/onboarding'} replace /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to={onboardingCompleted ? '/app' : '/onboarding'} replace /> : <AuthPage mode="signup" />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            {onboardingCompleted ? <Navigate to="/app" replace /> : <OnboardingFlow user={user} onComplete={completeOnboarding} />}
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <PrivateLayout />
          </RequireAuth>
        }
      >
        <Route path="/app" element={onboardingCompleted ? <Dashboard user={user} /> : <Navigate to="/onboarding" replace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            to={isAuthenticated ? (onboardingCompleted ? '/app' : '/onboarding') : '/welcome'}
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
