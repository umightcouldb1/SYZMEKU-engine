import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import './Profile.css';

const DEFAULT_PREFERENCES = {
  prismIntensity: 72,
  glassDensity: 58,
  motionEnabled: true,
  accent: 'cyan',
  interfaceMode: 'crystalline',
};

const accentOptions = ['cyan', 'violet', 'gold', 'emerald', 'rose'];
const interfaceModes = ['crystalline', 'iridescent', 'minimal'];

const formatCurrency = (amount = 0, currency = 'usd') => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: String(currency || 'usd').toUpperCase(),
}).format(Number(amount || 0));

export default function Profile() {
  const { ensureValidSession } = useAuth();
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const purchaseHistory = useMemo(() => profile?.purchasedProducts || profile?.history || [], [profile]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setIsLoading(true);
      setError('');

      try {
        const token = await ensureValidSession();
        if (!token) {
          setError('Sign in to view your profile.');
          return;
        }

        const response = await axios.get('/api/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;
        setProfile(response.data);
        setPreferences({ ...DEFAULT_PREFERENCES, ...(response.data?.preferences || response.data?.prefs || {}) });
      } catch (profileError) {
        if (!cancelled) {
          setError(profileError?.response?.data?.message || 'Profile retrieval failed.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [ensureValidSession]);

  const updatePreference = (key, value) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const token = await ensureValidSession();
      if (!token) {
        setError('Session expired. Sign in again to update preferences.');
        return;
      }

      const response = await axios.put('/api/profile', { preferences }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const nextProfile = response.data?.profile || profile;
      setProfile(nextProfile);
      setPreferences({ ...DEFAULT_PREFERENCES, ...(nextProfile?.preferences || nextProfile?.prefs || preferences) });
      setMessage(response.data?.message || 'Preferences updated.');
    } catch (saveError) {
      setError(saveError?.response?.data?.message || 'Preference update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <main className="profile-shell"><div className="profile-status">Synchronizing profile...</div></main>;
  }

  return (
    <main className="profile-shell" aria-label="SYZMEKU user profile">
      <section className="profile-header">
        <p>Operative Profile</p>
        <h1>{profile?.name || profile?.username || 'Commander Profile'}</h1>
        <span>{profile?.email || 'Identity pending'}</span>
      </section>

      {error && <div className="profile-alert profile-alert-error" role="alert">{error}</div>}
      {message && <div className="profile-alert" role="status">{message}</div>}

      <section className="profile-grid">
        <article className="profile-panel profile-tier-panel">
          <div>
            <p className="profile-label">Current Tier</p>
            <h2>{profile?.tier || 'public'}</h2>
          </div>
          <div className="profile-role-chip">{profile?.role || 'USER'}</div>
        </article>

        <article className="profile-panel profile-history-panel">
          <div className="profile-panel-heading">
            <p className="profile-label">Purchase History</p>
            <span>{purchaseHistory.length} records</span>
          </div>
          {purchaseHistory.length > 0 ? (
            <div className="profile-history-list">
              {purchaseHistory.map((product) => (
                <div className="profile-history-item" key={`${product.productId}-${product.checkoutSessionId || product.purchasedAt}`}>
                  <div>
                    <strong>{product.name || product.productId}</strong>
                    <span>{product.tier || product.status || 'active'}</span>
                  </div>
                  <p>{formatCurrency(product.amount, product.currency)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-muted">Completed Stripe purchases will appear here after payment confirmation is wired.</p>
          )}
        </article>

        <form className="profile-panel profile-preferences-panel" onSubmit={savePreferences}>
          <div className="profile-panel-heading">
            <p className="profile-label">Crystalline Preferences</p>
            <span>UI signal</span>
          </div>

          <label>
            Prism Intensity
            <input
              type="range"
              min="0"
              max="100"
              value={preferences.prismIntensity}
              onChange={(event) => updatePreference('prismIntensity', Number(event.target.value))}
            />
            <em>{preferences.prismIntensity}%</em>
          </label>

          <label>
            Glass Density
            <input
              type="range"
              min="0"
              max="100"
              value={preferences.glassDensity}
              onChange={(event) => updatePreference('glassDensity', Number(event.target.value))}
            />
            <em>{preferences.glassDensity}%</em>
          </label>

          <label>
            Accent Spectrum
            <select value={preferences.accent} onChange={(event) => updatePreference('accent', event.target.value)}>
              {accentOptions.map((accent) => <option key={accent} value={accent}>{accent}</option>)}
            </select>
          </label>

          <label>
            Interface Mode
            <select value={preferences.interfaceMode} onChange={(event) => updatePreference('interfaceMode', event.target.value)}>
              {interfaceModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>

          <label className="profile-toggle-row">
            Motion Enabled
            <input
              type="checkbox"
              checked={preferences.motionEnabled}
              onChange={(event) => updatePreference('motionEnabled', event.target.checked)}
            />
          </label>

          <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Preferences'}</button>
        </form>
      </section>
    </main>
  );
}
