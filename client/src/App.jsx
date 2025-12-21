import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';

function App() {
  const auth = useSelector((state) => state.auth) || {};
  const user = auth.user || null;
  const isLoading = auth.isLoading || false;

  if (isLoading) {
    return <div className="loading-screen">BEGINNING ASCENSION...</div>;
  }

  return (
    <div className="App">
      {!user ? <AuthScreen /> : <Dashboard />}
    </div>
  );
}

export default App;
