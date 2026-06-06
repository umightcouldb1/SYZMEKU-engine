// File: client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Provider } from 'react-redux'; // Identity Anchor
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { store } from './app/store';     // Redux Store
import './index.css';
import './Crystalline.css';
import App from './App.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';

function FallbackUI({ error }) {
  const message = error?.message ?? 'Unknown error';
  return <div style={{ color: 'red' }}>Engine Dissonance: {message}</div>;
}

const rootElement = document.getElementById('root');
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.REACT_APP_GOOGLE_CLIENT_ID || '';

if (!rootElement) {
  console.error('CRITICAL: Root element not found. The Engine has no anchor.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary FallbackComponent={FallbackUI}>
        <Provider store={store}>
          <GoogleOAuthProvider clientId={googleClientId}>
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </GoogleOAuthProvider>
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
