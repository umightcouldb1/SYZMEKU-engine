import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';

function App() {
  const authState = useSelector((state) => state.auth || {});
  const user = authState.user || null;
  const isLoading = authState.isLoading || false;

  if (isLoading) {
    return <div className="portal-text">SYNCHRONIZING...</div>;
  }

  return (
    <div className="App">
      {!user ? <AuthScreen /> : <Dashboard />}
    </div>
  );
}

export default App;
