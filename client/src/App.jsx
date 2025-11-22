import React, { useState, useEffect } from 'react';

// The API URL is read from the VITE_API_BASE_URL set in client/.env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function App() {
  const [message, setMessage] = useState('Attempting to connect to the backend API...');
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // Function to handle the exponential backoff for retrying API calls
    const fetchWithBackoff = async (url, retries = 5, delay = 1000) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setMessage(data.message);
        setStatus('success');
      } catch (error) {
        console.error(`Attempt failed. Retries left: ${retries}`, error);
        
        if (retries > 0) {
          // Wait for the calculated delay before retrying
          setTimeout(() => fetchWithBackoff(url, retries - 1, delay * 2), delay);
        } else {
          // If all retries fail, set the final error message
          setMessage('Failed to connect to the backend API after multiple retries. Check console for details.');
          setStatus('error');
        }
      }
    };

    // The API endpoint that the server exposes at the root '/'
    fetchWithBackoff(API_BASE_URL);
  }, []);

  const getStatusClasses = () => {
    switch (status) {
      case 'success':
        return 'bg-green-600 text-white shadow-lg';
      case 'error':
        return 'bg-red-600 text-white shadow-xl';
      case 'loading':
      default:
        return 'bg-blue-500 text-white animate-pulse';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className={`p-8 md:p-10 rounded-xl max-w-lg w-full transition-all duration-500 ${getStatusClasses()}`}>
        <h1 className="text-3xl md:text-4xl font-extrabold mb-4 text-center">
          Full Stack Deployment Status
        </h1>
        <div className="text-xl font-medium text-center break-words">
          {message}
        </div>
        {status === 'loading' && (
          <p className="mt-4 text-sm text-center opacity-80">
            Retrying connection... This may take a moment if the server is waking up.
          </p>
        )}
        {status === 'error' && (
          <div className="mt-6 p-3 bg-red-700/50 rounded-lg text-sm">
            <p className="font-bold mb-1">Troubleshooting Tips:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Confirm the server URL in `client/.env` is correct.</li>
              <li>Check your Render service logs for startup errors.</li>
              <li>Ensure your backend is still running.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
