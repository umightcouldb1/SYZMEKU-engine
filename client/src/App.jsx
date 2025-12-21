import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import './App.css';

function App() {
  const auth = useSelector((state) => state.auth || {});
  const user = auth.user;

  return (
    <div className="App">
      {!user ? (
        <AuthScreen />
      ) : (
        <Dashboard />
      )}
    </div>
  );
}

export default App;
