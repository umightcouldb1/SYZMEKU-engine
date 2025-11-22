import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Find the root element defined in index.html (id="root") and render the application there.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
