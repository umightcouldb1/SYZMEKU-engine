import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, register, reset } from './features/auth/authSlice';

const AuthPage = ({ mode = 'login' }) => {
  const isSignup = mode === 'signup';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, message } = useSelector((state) => state.auth || {});

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState(location.state?.message || '');

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
    <main className="entry-shell auth-prism-shell">
      <div className="prism-light-stream prism-light-stream-cyan" />
      <div className="prism-light-stream prism-light-stream-pink" />
      <div className="prism-grid-plane" />

      <section className="auth-prism-frame" aria-label={isSignup ? 'Create Big SYZ account' : 'Big SYZ login'}>
        <div className="iridescent-shimmer" />
        <div className="auth-panel auth-prism-panel">
          <div className="auth-heading-block">
            <p className="auth-eyebrow">Big SYZ Core Access</p>
            <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="auth-copy">
              {isSignup
                ? 'Start your guided alignment journey in less than two minutes.'
                : 'Align credentials to resume system measures.'}
            </p>
          </div>

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
                placeholder="commander@toisouljahacademy.com"
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

            <button type="submit" disabled={isLoading} className="entry-primary-button prism-submit-button">
              <span>{isLoading ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}</span>
            </button>
          </form>

          {(error || message) && <p className="auth-error-text">{error || message}</p>}

          <div className="auth-footer-row">
            <p className="auth-footer-copy">
              {isSignup ? 'Already have an account?' : 'New to Big SYZ?'}{' '}
              <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Create account'}</Link>
            </p>
            <span className="auth-version-chip">v5.0.0-GSI</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthPage;
