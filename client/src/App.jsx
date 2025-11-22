// client/src/App.jsx
import React, { useState, useEffect } from 'react';

// CRITICAL: Read the live API URL from the environment variable. 
// This connects your client to the live Render backend service.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:10000';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use the dynamic API_BASE_URL for the fetch request
        const response = await fetch(`${API_BASE_URL}/api/hello`); 
        if (!response.ok) {
          throw new Error(`Server returned HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        // Assuming your backend responds with { message: "..." }
        setData(result.message);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); 

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-lg text-white border border-gray-700">
        <h1 className="text-3xl font-bold mb-6 text-emerald-400">
          SYZMEKU Engine Status
        </h1>
        
        {loading && (
          <div className="flex items-center space-x-2 text-lg text-gray-400 animate-pulse">
            <svg className="animate-spin h-5 w-5 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>Connecting to live API at <span className="font-mono text-yellow-400">{API_BASE_URL}</span>...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900 border border-red-700 p-4 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold text-red-300 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Deployment Failure
            </h2>
            <p className="text-sm mt-2 text-red-400">
              The frontend could not connect to the API. This usually means the Render deployment is still building or failed.
            </p>
            <p className="text-sm mt-3 font-mono break-all text-red-200 bg-red-800 p-2 rounded">
                Details: {error}
            </p>
          </div>
        )}

        {data && (
          <div className="bg-green-900 border border-green-700 p-4 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold text-green-300 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Success! Full Stack is Live!
            </h2>
            <p className="text-lg mt-2 text-green-100">
              Backend Message: 
              <span className="font-mono ml-2 p-1 bg-green-800 rounded">{data}</span>
            </p>
            <p className="text-sm mt-4 text-green-400">
                Connected to live API at: <span className="font-mono text-green-200">{API_BASE_URL}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
