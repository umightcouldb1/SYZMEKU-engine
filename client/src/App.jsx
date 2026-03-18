import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
const APP_HOME_ROUTE = '/app';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    return null;
  }
};

const persistUserOnboardingState = (completed) => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (!storedUser) return;

    localStorage.setItem('user', JSON.stringify({
      ...storedUser,
      onboarding: {
        ...(storedUser.onboarding || {}),
        completed,
      },
    }));
  } catch (_error) {
    // ignore malformed local user state during onboarding sync
  }
};

function App() {
  const auth = useSelector((state) => state.auth || {});
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const user = useMemo(() => auth.user || getStoredUser(), [auth.user]);
  const isAuthenticated = Boolean(user);

  const syncOnboardingStatus = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) {
      setOnboardingCompleted(false);
      setOnboardingReady(true);
      return { completed: false, source: 'guest' };
    }

    if (!silent) {
      setOnboardingReady(false);
    }

    try {
      const response = await axios.get('/api/core/onboarding/status');
      const completed = Boolean(response.data?.completed);
      console.info('[onboarding] status sync success', {
        completed,
        targetRoute: completed ? APP_HOME_ROUTE : '/onboarding',
      });
      setOnboardingCompleted(completed);
      localStorage.setItem(ONBOARDING_STORAGE_KEY, completed ? 'true' : 'false');
      persistUserOnboardingState(completed);
      return { completed, source: 'server', data: response.data };
    } catch (error) {
      const localState = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
      console.warn('[onboarding] status sync fallback', {
        completed: localState,
        message: error?.response?.data?.message || error?.message || 'Unknown sync error',
      });
      setOnboardingCompleted(localState);
      persistUserOnboardingState(localState);
      return { completed: localState, source: 'local', error };
    } finally {
      setOnboardingReady(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    const runSync = async () => {
      const result = await syncOnboardingStatus();
      if (cancelled) return;
      return result;
    };

    runSync();

    return () => {
      cancelled = true;
    };
  }, [syncOnboardingStatus, user?._id]);

  const completeOnboarding = async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    persistUserOnboardingState(true);
    setOnboardingCompleted(true);
    const result = await syncOnboardingStatus({ silent: true });
    return {
      completed: Boolean(result?.completed),
      targetRoute: APP_HOME_ROUTE,
      source: result?.source || 'local',
    };
  };

  if (!onboardingReady) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  return (
    <Routes>
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to={onboardingCompleted ? APP_HOME_ROUTE : '/onboarding'} replace /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to={onboardingCompleted ? APP_HOME_ROUTE : '/onboarding'} replace /> : <AuthPage mode="signup" />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            {onboardingCompleted ? <Navigate to={APP_HOME_ROUTE} replace /> : <OnboardingFlow user={user} onComplete={completeOnboarding} appHomeRoute={APP_HOME_ROUTE} />}
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
        <Route path={APP_HOME_ROUTE} element={onboardingCompleted ? <Dashboard user={user} /> : <Navigate to="/onboarding" replace />} />
        <Route path="/dashboard" element={<Navigate to={APP_HOME_ROUTE} replace />} />
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            to={isAuthenticated ? (onboardingCompleted ? APP_HOME_ROUTE : '/onboarding') : '/welcome'}
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
