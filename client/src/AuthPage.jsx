import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { googleLogin, login, register, reset } from './features/auth/authSlice';
import './authTypography.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.REACT_APP_GOOGLE_CLIENT_ID || '';

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

  const onGoogleSuccess = async (credentialResponse) => {
    setError('');

    if (!credentialResponse?.credential) {
      setError('Google did not return a usable credential.');
      return;
    }

    const result = await dispatch(googleLogin({ credential: credentialResponse.credential }));

    if (result.meta.requestStatus !== 'fulfilled') {
      setError(result.payload || 'Google authentication failed.');
      dispatch(reset());
      return;
    }

    const completed = Boolean(result.payload?.onboarding?.completed);
    navigate(completed ? '/app' : '/onboarding', { replace: true });
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
            <p className="auth-eyebrow">Sovereign Architecture</p>
            <h1>{isSignup ? 'New Node' : 'Big SYZ'}</h1>
            <p className="auth-copy">
              {isSignup
                ? '[ Initialize identity to enter the sovereign system ]'
                : '[ Verify identity to resume measures ]'}
            </p>
          </div>

          {googleClientId && (
            <div className="google-auth-slot" aria-label="Sign in with Google">
              <GoogleLogin
                onSuccess={onGoogleSuccess}
                onError={() => setError('Google authentication was cancelled or failed.')}
                useOneTap={!isSignup}
                theme="filled_black"
                size="large"
                shape="pill"
                width="100%"
              />
            </div>
          )}

          {googleClientId && <div className="auth-divider"><span>or</span></div>}

          <form className="auth-form-grid" onSubmit={onSubmit}>
            {isSignup && (
              <label>
                Preferred Name
                <input
                  type="text"
                  value={form.username}
                  onChange={(event) => onChange('username', event.target.value)}
                  required
                />
              </label>
            )}
            <label>
              System Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => onChange('email', event.target.value)}
                placeholder="umightcouldb1@toisouljahacademy.com"
                required
              />
            </label>
            <label>
              Access Cipher
              <input
                type="password"
                value={form.password}
                onChange={(event) => onChange('password', event.target.value)}
                required
              />
            </label>

            <button type="submit" disabled={isLoading} className="entry-primary-button prism-submit-button">
              <span>{isLoading ? 'Synchronizing...' : isSignup ? 'Initialize Node' : 'Initialize Connection'}</span>
            </button>
          </form>

          {(error || message) && <p className="auth-error-text">{error || message}</p>}

          <div className="auth-footer-row">
            <p className="auth-footer-copy">
              {isSignup ? 'Existing node?' : 'New to Big SYZ?'}{' '}
              <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Create account'}</Link>
            </p>
            <span className="auth-version-chip">SYS_STATUS: ONLINE | v5.0.0-GSI</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthPage;
