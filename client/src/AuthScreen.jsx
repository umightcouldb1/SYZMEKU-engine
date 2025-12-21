// File: client/src/AuthScreen.jsx
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, register, reset } from './features/auth/authSlice';

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true); 
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { user, isLoading, isError, isSuccess, message } = useSelector(
    (state) => state.auth
  );

  useEffect(() => {
    if (isSuccess || user) {
        navigate('/dashboard');
    }
    dispatch(reset());
  }, [user, isSuccess, navigate, dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const userData = { username, email, password };
    if (isLogin) {
      dispatch(login({ email, password }));
    } else {
      dispatch(register(userData));
    }
  };

  return (
    <div className="auth-container">
      <div className="main-header">
        <h1>SYZMEKU ENGINE // ACCESS PROTOCOL</h1>
      </div>
      <div className="auth-form-panel">
        <h2 className="panel-title">{isLogin ? 'SECURE LOGIN' : 'NEW REGISTRATION'}</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Security Key"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'PROCESSING...' : (isLogin ? 'INITIATE LOGIN' : 'REGISTER')}
          </button>
        </form>
        {isError && <div className="error-message">{message}</div>}
        <button className="toggle-auth-button" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Switch to Registration' : 'Switch to Login'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
