import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './AuthPage';
import Dashboard from './sovereign-shield/Dashboard';
import OnboardingFlow from './OnboardingFlow';
import OnboardingVoiceBridge from './OnboardingVoiceBridge';
import WelcomeScreen from './WelcomeScreen';
import Catalog from './components/Catalog';
import Profile from './components/Profile';
import RequireAuth from './components/RequireAuth';
import { BiometricProvider } from './context/BiometricContext';
import PrivateLayout from './layouts/PrivateLayout';
import './entryFlow.css';

const ONBOARDING_STORAGE_KEY = 'syz_onboarding_complete';
const APP_HOME_ROUTE = '/app';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (_error) {
    localStorage.removeItem('user');
    return null;
  }
};

const getStoredToken = (user = null) => user?.token || localStorage.getItem('token') || '';

const getLocalOnboardingComplete = () => {
  const storedUser = getStoredUser();
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true' || Boolean(storedUser?.onboarding?.completed);
};

const persistUserOnboardingState = (completed, onboarding = null) => {
  try {
    const storedUser = getStoredUser();
    if (!storedUser) return;

    const token = getStoredToken(storedUser);
    const role = storedUser.role || localStorage.getItem('user_role') || 'user';

    localStorage.setItem('user', JSON.stringify({
      ...storedUser,
      token,
      role,
      onboarding: {
        ...(storedUser.onboarding || {}),
        ...(onboarding || {}),
        completed,
      },
    }));
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user_role', role);
  } catch (_error) {
    // ignore malformed local user state during onboarding sync
  }
};

const buildAdminOnboardingState = (signatureData = {}, fallbackName = '') => {
  const profile = signatureData.profile || {};

  return {
    completed: true,
    completedAt: new Date().toISOString(),
    profile: {
      preferredName: profile.identifier || fallbackName,
      lifeStage: profile.missionObjective || 'Admin development session',
      supportAreas: [
        profile.originVector,
        profile.missionObjective,
      ].filter(Boolean),
      mentorStyle: 'Strategic and focused',
      sovereignMatrixNote: profile.missionObjective || '',
      onboardingReflection: profile.missionObjective || '',
      goals: [profile.missionObjective].filter(Boolean),
    },
  };
};

function App() {
  const auth = useSelector((state) => state.auth || {});
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => getLocalOnboardingComplete());

  const user = useMemo(() => auth.user || getStoredUser(), [auth.user]);
  const token = getStoredToken(user);
  const isAuthenticated = Boolean(token);

  const syncOnboardingStatus = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) {
      setOnboardingCompleted(false);
      setOnboardingReady(true);
      return { completed: false, source: 'guest' };
    }

    const localState = getLocalOnboardingComplete();
    if (localState) {
      setOnboardingCompleted(true);
    }

    if (!silent) {
      setOnboardingReady(false);
    }

    try {
      const adminSignatureResponse = await axios.get('/api/admin/signature').catch(() => ({ data: null }));
      if (adminSignatureResponse.data?.success) {
        const adminOnboarding = buildAdminOnboardingState(
          adminSignatureResponse.data,
          user?.username || user?.name || '',
        );

        console.info('[onboarding] admin signature bypass active', {
          targetRoute: APP_HOME_ROUTE,
          identifier: adminSignatureResponse.data?.profile?.identifier,
        });
        setOnboardingCompleted(true);
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
        persistUserOnboardingState(true, adminOnboarding);
        setOnboardingReady(true);
        return { completed: true, source: 'admin-signature', data: adminSignatureResponse.data };
      }

      const response = await axios.get('/api/core/onboarding/status');
      const completed = Boolean(response.data?.completed || localState);
      console.info('[onboarding] status sync success', {
        completed,
        targetRoute: completed ? APP_HOME_ROUTE : '/onboarding',
      });
      setOnboardingCompleted(completed);
      localStorage.setItem(ONBOARDING_STORAGE_KEY, completed ? 'true' : 'false');
      persistUserOnboardingState(completed, completed ? response.data : null);
      return { completed, source: 'server', data: response.data };
    } catch (error) {
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
  }, [isAuthenticated, user?.name, user?.username]);

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

  const completeOnboarding = async (completionData = {}) => {
    const onboarding = completionData?.onboarding || { completed: true };
    const completed = Boolean(onboarding?.completed ?? true);

    localStorage.setItem(ONBOARDING_STORAGE_KEY, completed ? 'true' : 'false');
    persistUserOnboardingState(completed, onboarding);
    setOnboardingCompleted(completed);
    setOnboardingReady(true);

    if (completed) {
      syncOnboardingStatus({ silent: true });
    }

    return {
      completed,
      targetRoute: APP_HOME_ROUTE,
      source: 'completion',
    };
  };

  if (!onboardingReady) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  return (
    <BiometricProvider>
      <Routes>
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/products" element={<Navigate to="/catalog" replace />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to={onboardingCompleted ? APP_HOME_ROUTE : '/onboarding'} replace /> : <AuthPage mode="login" />} />
        <Route path="/signup" element={isAuthenticated ? <Navigate to={onboardingCompleted ? APP_HOME_ROUTE : '/onboarding'} replace /> : <AuthPage mode="signup" />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              {onboardingCompleted ? (
                <Navigate to={APP_HOME_ROUTE} replace />
              ) : (
                <>
                  <OnboardingFlow user={user} onComplete={completeOnboarding} appHomeRoute={APP_HOME_ROUTE} />
                  <OnboardingVoiceBridge />
                </>
              )}
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
          <Route path="/app/profile" element={onboardingCompleted ? <Profile /> : <Navigate to="/onboarding" replace />} />
          <Route path="/profile" element={onboardingCompleted ? <Profile /> : <Navigate to="/onboarding" replace />} />
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
    </BiometricProvider>
  );
}

export default App;
