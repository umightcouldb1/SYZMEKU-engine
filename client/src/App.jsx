import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';

function App() {
  const auth = useSelector((state) => state.auth || {});
  const { user, isLoading } = auth;

  if (isLoading) {
    return <div style={{ color: 'gold', padding: '20px' }}>Loading Engine...</div>;
  }

  return (
    <div className="App">
      {!user ? <AuthScreen /> : <Dashboard />}
    </div>
  );
}

export default App;
