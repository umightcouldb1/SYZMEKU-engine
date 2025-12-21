import React from 'react';
import { useSelector } from 'react-redux';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import './App.css';

function App() {
  const { user } = useSelector((state) => state.auth);

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
