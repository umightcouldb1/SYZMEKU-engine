import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';

function App() {
  const auth = useSelector((state) => state.auth || {});
  const user = auth.user || null;
  const isLoading = auth.isLoading || false;

  if (isLoading) {
    return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
  }

  return (
    <div className="App">
      {!user ? <AuthScreen /> : <Dashboard user={user} />}
    </div>
  );
}

export default App;
