import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { googleLogin, login, register, reset } from './features/auth/authSlice';
import { getGoogleClientId } from './config/googleOAuth';
import './authTypography.css';

const GOOGLE_SCRIPT_ID = 'google-identity-services-sdk';
let googleSdkPromise = null;

const ensureGoogleIdentityScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleSdkPromise) return googleSdkPromise;

  googleSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google Identity Services SDK failed to load.'));
    document.head.appendChild(script);
  });

  return googleSdkPromise;
};

const AuthPage = ({ mode = 'login' }) => {
  const isSignup = mode === 'signup';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, message } = useSelector((state) => state.auth || {});
  const googleButtonRef = useRef(null);
  const googleRenderFrameRef = useRef(null);
  const googleClientId = getGoogleClientId();
  const hasGoogleClientId = Boolean(googleClientId);

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState(location.state?.message || '');

  const getPostAuthRoute = useCallback((fallbackRoute) => {
    const from = location.state?.from;
    if (from?.pathname) {
      return `${from.pathname}${from.search || ''}`;
    }

    return fallbackRoute;
  }, [location.state]);

  const onChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onGoogleSuccess = useCallback(async (credentialResponse) => {
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
    navigate(completed ? getPostAuthRoute('/app') : '/onboarding', { replace: true });
  }, [dispatch, getPostAuthRoute, navigate]);

  useEffect(() => {
    if (!hasGoogleClientId) return undefined;

    let cancelled = false;

    const drawGoogleButton = (google) => {
      const buttonHost = googleButtonRef.current;
      if (!buttonHost || !google?.accounts?.id) return false;

      const slotWidth = Math.floor(buttonHost.getBoundingClientRect().width);
      if (slotWidth <= 0) return false;

      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: onGoogleSuccess,
      });

      buttonHost.innerHTML = '';
      google.accounts.id.renderButton(buttonHost, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        type: 'standard',
        text: isSignup ? 'signup_with' : 'signin_with',
        width: Math.min(400, slotWidth),
      });

      return true;
    };

    const renderGoogleButton = async (attempt = 0) => {
      try {
        const google = await ensureGoogleIdentityScript();
        if (cancelled) return;

        const rendered = drawGoogleButton(google);
        if (!rendered && attempt < 8) {
          googleRenderFrameRef.current = window.requestAnimationFrame(() => {
            renderGoogleButton(attempt + 1);
          });
        }
      } catch (sdkError) {
        if (!cancelled) {
          setError(sdkError?.message || 'Google sign-in failed to initialize.');
        }
      }
    };

    renderGoogleButton();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => renderGoogleButton())
      : null;

    if (resizeObserver && googleButtonRef.current) {
      resizeObserver.observe(googleButtonRef.current);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (googleRenderFrameRef.current) {
        window.cancelAnimationFrame(googleRenderFrameRef.current);
      }
    };
  }, [googleClientId, hasGoogleClientId, isSignup, onGoogleSuccess]);

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

    navigate(isSignup ? '/onboarding' : getPostAuthRoute('/app'), { replace: true });
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

          <div className="google-auth-slot" aria-label="Sign in with Google">
            {hasGoogleClientId ? (
              <div className="google-button-frame">
                <div id="google-signin-button" className="google-signin-button" ref={googleButtonRef} />
              </div>
            ) : (
              <p className="google-auth-unavailable">Google sign-in requires VITE_GOOGLE_CLIENT_ID in the frontend build.</p>
            )}
          </div>

          {hasGoogleClientId && <div className="auth-divider"><span>or</span></div>}

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
