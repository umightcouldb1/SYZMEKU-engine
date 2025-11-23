import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth'; 

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true); // Toggle between Login and Signup
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');

  const { login, signup } = useAuth(); // Custom hook for authentication logic

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setStatus('PROCESSING...');

    try {
      if (isLogin) {
        // Login Logic
        await login(email, password);
        setStatus('LOGIN SUCCESS');
      } else {
        // Signup Logic
        await signup(username, email, password);
        setStatus('REGISTRATION SUCCESS');
      }
      // Success: useAuth should handle redirect/state update, so the component unmounts
    } catch (err) {
      console.error(err);
      setError(err.message || 'Authentication Failed. Check credentials/server.');
      setStatus('FAILURE');
    }
  };

  return (
    <div className="auth-container">
      <div className="main-header">
        <h1>SYZMEKU ENGINE // ACCESS PROTOCOL</h1>
      </div>
      <div className="auth-form-panel">
        <h2 className="panel-title">{isLogin ? 'SECURE LOGIN' : 'NEW USER REGISTRATION'}</h2>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <input
              type="text"
              placeholder="Designate Username (e.g., CommanderSouljah)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={!isLogin}
            />
          )}
          <input
            type="email"
            placeholder="Enter Operative Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Enter Security Key (Password)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <button type="submit" disabled={status === 'PROCESSING...'}>
            {isLogin ? 'INITIATE LOGIN' : 'REGISTER AND ACCESS'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
        {status && status !== 'PROCESSING...' && <div className="status-message">{status}</div>}
        {status === 'PROCESSING...' && <div className="loading-indicator">Authenticating...</div>}


        <hr className="divider" />
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button 
            type="button" 
            className="toggle-auth-button"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'New User? Switch to Registration' : 'Already Registered? Switch to Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
