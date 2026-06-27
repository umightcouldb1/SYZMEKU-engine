// File: client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { ErrorBoundary } from 'react-error-boundary';
import { Provider } from 'react-redux'; // Identity Anchor
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { store } from './app/store';     // Redux Store
import './index.css';
import './Crystalline.css';
import './responsive.css';
import './adaptiveInterface.css';
import App from './App.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import { InteractionProvider } from './context/InteractionContext.jsx';
import { getGoogleClientId } from './config/googleOAuth';
import { getApiBaseUrl } from './config/apiConfig.js';

function FallbackUI({ error }) {
  const message = error?.message ?? 'Unknown error';
  return <div style={{ color: 'red' }}>Engine Dissonance: {message}</div>;
}

const rootElement = document.getElementById('root');
const googleClientId = getGoogleClientId();
const hasGoogleClientId = Boolean(googleClientId);
const apiOrigin = getApiBaseUrl();

axios.defaults.baseURL = apiOrigin;
axios.defaults.withCredentials = true;

const AppShell = () => {
  const shell = (
    <AuthProvider>
      <InteractionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </InteractionProvider>
    </AuthProvider>
  );

  if (!hasGoogleClientId) return shell;

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      {shell}
    </GoogleOAuthProvider>
  );
};

if (!rootElement) {
  console.error('CRITICAL: Root element not found. The Engine has no anchor.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary FallbackComponent={FallbackUI}>
        <Provider store={store}>
          <AppShell />
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
