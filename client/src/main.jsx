import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // CRITICAL: Ensure this is the first import
import App from './App.jsx';
import { AuthProvider } from './hooks/useAuth.jsx'; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider> 
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
