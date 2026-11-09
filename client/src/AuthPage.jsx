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
  const googleRenderedRef = useRef(null);
  const passwordRef = useRef('');
  const googleLinkRequiredRef = useRef(false);
  const legacyUpgradeRef = useRef('');
  const upgradeChallengeRef = useRef('');
  const googlePendingRef = useRef(false);
  const [legacyUpgradeRequired, setLegacyUpgradeRequired] = useState(false);
  const [legacyUpgrade, setLegacyUpgrade] = useState('');
  const [googleRecoveryAvailable, setGoogleRecoveryAvailable] = useState(false);
  const [googleLinkRequired, setGoogleLinkRequired] = useState(false);
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
    if (field === 'password') passwordRef.current = value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onGoogleSuccess = useCallback(async (credentialResponse) => {
    if (googlePendingRef.current) return;
    setError('');

    if (!credentialResponse?.credential) {
      setError('Google did not return a usable credential.');
      return;
    }

    googlePendingRef.current = true;
    let result;
    try {
      result = await dispatch(googleLogin({
        credential: credentialResponse.credential,
        ...(googleLinkRequiredRef.current || legacyUpgradeRef.current === 'link-password' ? { password: passwordRef.current } : {}),
        ...(legacyUpgradeRef.current ? { legacyUpgrade: legacyUpgradeRef.current, upgradeChallenge: upgradeChallengeRef.current } : {}),
      }));
    } finally { googlePendingRef.current = false; }

    if (result.meta.requestStatus !== 'fulfilled') {
      if (result.payload?.code === 'LEGACY_ACCOUNT_UPGRADE_REQUIRED') {
        googleLinkRequiredRef.current = false;
        setGoogleLinkRequired(false);
        passwordRef.current = '';
        setForm((prev) => ({ ...prev, password: '' }));
        upgradeChallengeRef.current = result.payload.upgradeChallenge || '';
        setGoogleRecoveryAvailable(result.payload.googleRecoveryAvailable === true);
        legacyUpgradeRef.current = '';
        setLegacyUpgrade('');
        setLegacyUpgradeRequired(true);
      }
      if (result.payload?.code === 'GOOGLE_ACCOUNT_LINK_REQUIRED') {
        legacyUpgradeRef.current = '';
        upgradeChallengeRef.current = '';
        setLegacyUpgrade('');
        setLegacyUpgradeRequired(false);
        setGoogleRecoveryAvailable(false);
        passwordRef.current = '';
        setForm((prev) => ({ ...prev, password: '' }));
        googleLinkRequiredRef.current = true;
        setGoogleLinkRequired(true);
      }
      setError(result.payload?.message || result.payload || 'Google authentication failed.');
      dispatch(reset());
      return;
    }

    passwordRef.current = '';
    googleLinkRequiredRef.current = false;
    legacyUpgradeRef.current = '';
    upgradeChallengeRef.current = '';
    setLegacyUpgrade('');
    setLegacyUpgradeRequired(false);
    setGoogleLinkRequired(false);
    setForm((prev) => ({ ...prev, password: '' }));
    const completed = Boolean(result.payload?.onboarding?.completed);
    navigate(completed ? getPostAuthRoute('/app') : '/onboarding', { replace: true });
  }, [dispatch, getPostAuthRoute, navigate]);

  useEffect(() => {
    if (!hasGoogleClientId) return undefined;

    let cancelled = false;
    googleRenderedRef.current = null;

    const drawGoogleButton = (google) => {
      const buttonHost = googleButtonRef.current;
      if (!buttonHost || !google?.accounts?.id) return false;

      const slotWidth = Math.floor(buttonHost.getBoundingClientRect().width);
      if (slotWidth <= 0) return false;
      const buttonWidth = Math.min(400, slotWidth);
      if (googleRenderedRef.current?.host === buttonHost
          && googleRenderedRef.current.width === buttonWidth && buttonHost.childElementCount > 0) return true;

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
        width: buttonWidth,
      });
      googleRenderedRef.current = { host: buttonHost, width: buttonWidth };

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

          {legacyUpgradeRequired && <div role="status">
            <p>Secure your existing account once. Your data and purchases stay intact. Either choice signs out prior sessions for this account.</p>
            <label>Choose how to secure this account
              <select value={legacyUpgrade} disabled={isLoading} onChange={(event) => {
                legacyUpgradeRef.current = event.target.value;
                setLegacyUpgrade(event.target.value);
                if (event.target.value === 'google-only') { passwordRef.current = ''; setForm((prev) => ({ ...prev, password: '' })); }
              }}>
                <option value="">Choose an option before continuing</option>
                <option value="link-password">Keep my current password and link Google</option>
                <option value="google-only" disabled={!googleRecoveryAvailable}>Use Google only and disable my old password</option>
              </select>
            </label>
            {!googleRecoveryAvailable && <p>Google cannot verify current ownership of this email for recovery. Use your current password, or contact support for manual account recovery.</p>}
            <p>{legacyUpgrade === 'link-password' ? 'Enter your current password below, then choose Google again to confirm.' : 'Choosing Google again confirms your selected security upgrade.'}</p>
          </div>}

          {(googleLinkRequired || legacyUpgradeRequired) && <div role="status">
            {!legacyUpgradeRequired && <p>Enter your existing account password below, then choose Google again to link both sign-in methods. Password sign-in is still available.</p>}
            <button type="button" disabled={isLoading} onClick={() => {
              if (isLoading || googlePendingRef.current) return;
              legacyUpgradeRef.current = '';
              upgradeChallengeRef.current = '';
              setLegacyUpgrade('');
              setLegacyUpgradeRequired(false);
              passwordRef.current = '';
              googleLinkRequiredRef.current = false;
              setGoogleLinkRequired(false);
              setForm((prev) => ({ ...prev, password: '' }));
              setError('');
              dispatch(reset());
            }}>Cancel Google linking</button>
          </div>}

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
