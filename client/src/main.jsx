// File: client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Provider } from 'react-redux'; // Identity Anchor
import { store } from './app/store';     // Redux Store
import './index.css';
import App from './App.jsx';

function FallbackUI({ error }) {
  return <div style={{ color: 'red' }}>Engine Dissonance: {error.message}</div>;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('CRITICAL: Root element not found. The Engine has no anchor.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary FallbackComponent={FallbackUI}>
        <Provider store={store}>
          <App />
        </Provider>
      </ErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>,
  );
}
