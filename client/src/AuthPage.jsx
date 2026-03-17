import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { login, register, reset } from './features/auth/authSlice';

const AuthPage = ({ mode = 'login' }) => {
  const isSignup = mode === 'signup';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, message } = useSelector((state) => state.auth || {});

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');

  const onChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const action = isSignup ? register(form) : login({ email: form.email, password: form.password });
    const result = await dispatch(action);

    if (result.meta.requestStatus !== 'fulfilled') {
      setError(result.payload || 'Unable to authenticate right now.');
      dispatch(reset());
      return;
    }

    navigate(isSignup ? '/onboarding' : '/app', { replace: true });
  };

  return (
    <main className="entry-shell">
      <section className="auth-panel">
        <p className="auth-eyebrow">Big SYZ access</p>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-copy">
          {isSignup
            ? 'Start your guided alignment journey in less than two minutes.'
            : 'Pick up where you left off with your SYZ guidance.'}
        </p>

        <form className="auth-form-grid" onSubmit={onSubmit}>
          {isSignup && (
            <label>
              Preferred name
              <input
                type="text"
                value={form.username}
                onChange={(event) => onChange('username', event.target.value)}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange('email', event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange('password', event.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={isLoading} className="entry-primary-button">
            {isLoading ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        {(error || message) && <p className="auth-error-text">{error || message}</p>}

        <p className="auth-footer-copy">
          {isSignup ? 'Already have an account?' : 'New to Big SYZ?'}{' '}
          <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Create account'}</Link>
        </p>
      </section>
    </main>
  );
};

export default AuthPage;
