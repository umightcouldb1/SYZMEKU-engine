import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const LIFE_STAGE_OPTIONS = [
  'I’m figuring things out',
  'I’m building something meaningful',
  'I’m recovering and resetting',
  'I’m maintaining momentum',
];

const CUSTOM_LIFE_STAGE_LABEL = 'Something else';

const SUPPORT_STYLE_OPTIONS = [
  'Calm and grounding',
  'Direct and honest',
  'Strategic and focused',
  'Reflective and deep',
];

const ONBOARDING_STEPS = [
  {
    key: 'name',
    type: 'short',
    prompt: 'What should I call you?',
    label: 'Preferred name',
    placeholder: 'Enter your preferred name',
  },
  {
    key: 'lifeStage',
    type: 'multi-choice',
    prompt: 'Where are you right now in this season of life?',
    label: 'Life stage',
    options: LIFE_STAGE_OPTIONS,
  },
  {
    key: 'primaryConcern',
    type: 'long',
    prompt: 'What has been taking up the most emotional bandwidth lately?',
    label: 'Current concern',
    placeholder: 'Share what feels most important right now',
  },
  {
    key: 'interactionStyle',
    type: 'choice',
    prompt: 'How do you want me to show up when supporting you?',
    label: 'Preferred support style',
    options: SUPPORT_STYLE_OPTIONS,
  },
  {
    key: 'goals',
    type: 'long',
    prompt: 'What would progress look like for you over the next few weeks?',
    label: 'Baseline state and goals',
    placeholder: 'Describe the state you want to move toward',
  },
];

const SUPPORT_COPY = {
  short: 'Short answer step: keep it simple and direct.',
  long: 'Reflection step: take your time and write freely.',
  choice: 'Selection step: choose the option that feels most true right now.',
  'multi-choice': 'Selection step: choose the options that feel most true right now.',
};

const formatValue = (value) => (Array.isArray(value) ? value.join(', ') : value);

const getResponse = (field, value) => {
  const displayValue = formatValue(value);
  if (field === 'name') return `${displayValue}—great to meet you. We’ll build your guidance around that identity.`;
  if (field === 'lifeStage') return `Thank you for naming that. ${displayValue} gives us an honest starting point.`;
  if (field === 'primaryConcern') return 'I hear that. We’ll turn this signal into practical direction.';
  if (field === 'interactionStyle') return `${displayValue} works. I’ll keep that tone consistent with you.`;
  if (field === 'goals') return 'Clear direction. We can now translate this into daily aligned momentum.';
  return 'Thank you for sharing that.';
};

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
  delete axios.defaults.headers.common.Authorization;
};

const getStoredToken = (user = null) => user?.token || localStorage.getItem('token') || '';

const hasValue = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim()));

const OnboardingFlow = ({ user, onComplete, appHomeRoute = '/app' }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mentorResponse, setMentorResponse] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [customLifeStageActive, setCustomLifeStageActive] = useState(false);
  const [customLifeStageText, setCustomLifeStageText] = useState('');
  const [form, setForm] = useState({
    name: user?.username || '',
    lifeStage: [],
    primaryConcern: '',
    interactionStyle: '',
    goals: '',
  });

  const currentStep = ONBOARDING_STEPS[currentIndex];

  const payload = useMemo(
    () => ({
      name: form.name,
      lifeStage: formatValue(form.lifeStage),
      lifeStages: form.lifeStage,
      primaryConcern: form.primaryConcern,
      interactionStyle: form.interactionStyle,
      goals: [form.goals].filter(Boolean),
      preferredName: form.name,
      supportAreas: [...form.lifeStage, form.primaryConcern, form.goals].filter(Boolean),
      mentorStyle: form.interactionStyle,
    }),
    [form],
  );

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleLifeStage = (option) => {
    setForm((prev) => {
      const current = Array.isArray(prev.lifeStage) ? prev.lifeStage : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, lifeStage: next };
    });
  };

  const removeLifeStage = (option) => {
    setForm((prev) => ({
      ...prev,
      lifeStage: prev.lifeStage.filter((item) => item !== option),
    }));
  };

  const commitCustomLifeStage = () => {
    const value = customLifeStageText.trim();
    if (!value) return;
    setForm((prev) => {
      const current = Array.isArray(prev.lifeStage) ? prev.lifeStage : [];
      return current.includes(value) ? prev : { ...prev, lifeStage: [...current, value] };
    });
    setCustomLifeStageText('');
    setCustomLifeStageActive(false);
  };

  const handleCustomLifeStageKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCustomLifeStage();
    }
    if (event.key === 'Escape') {
      setCustomLifeStageText('');
      setCustomLifeStageActive(false);
    }
  };

  const nextStep = () => {
    const value = form[currentStep.key];
    if (!hasValue(value)) return;
    setMentorResponse(getResponse(currentStep.key, value));
    setCurrentIndex((prev) => prev + 1);
  };

  const redirectToLogin = () => {
    clearStaleAuthState();
    navigate('/login', {
      replace: true,
      state: { message: 'Your session needs a fresh login before Big SYZ Home can open.' },
    });
  };

  const navigateToHome = async () => {
    setLoading(true);
    setCompletionError('');

    try {
      if (!getStoredToken(user)) {
        redirectToLogin();
        return;
      }

      const completionResponse = await axios.post('/api/core/onboarding/complete', payload);
      const syncResult = await onComplete?.(completionResponse.data);
      const onboardingComplete = Boolean(syncResult?.completed ?? completionResponse.data?.onboarding?.completed);

      console.info('[onboarding] completion flow success', {
        completed: onboardingComplete,
        source: syncResult?.source || 'component',
        targetRoute: syncResult?.targetRoute || appHomeRoute,
      });

      if (!onboardingComplete) {
        throw new Error('Onboarding saved, but your session did not refresh correctly. Please try entering Big SYZ Home again.');
      }

      navigate(syncResult?.targetRoute || appHomeRoute, { replace: true });
    } catch (error) {
      if (error?.response?.status === 401) {
        redirectToLogin();
        return;
      }

      const message = error?.response?.data?.message || error?.message || 'We saved your progress, but could not enter Big SYZ Home. Please try again.';
      console.error('[onboarding] completion flow failed', {
        message,
        targetRoute: appHomeRoute,
        onboardingComplete: error?.response?.data?.onboarding?.completed,
      });
      setCompletionError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!currentStep) {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-stage onboarding-wide">
          <h2>You’re all set.</h2>
          <p className="mentor-muted">Big SYZ is calibrated and ready to support your next moves.</p>
          <button type="button" className="entry-primary-button" disabled={loading} onClick={navigateToHome}>
            {loading ? 'Checking session...' : 'ENTER BIG SYZ HOME'}
          </button>
          {completionError && <p className="auth-error-text">{completionError}</p>}
        </section>
      </main>
    );
  }

  const stepNumber = currentIndex + 1;
  const isShort = currentStep.type === 'short';
  const isLong = currentStep.type === 'long';
  const isMultiChoice = currentStep.type === 'multi-choice';

  return (
    <main className="onboarding-shell">
      <section className={`onboarding-stage ${isLong ? 'onboarding-wide' : isShort ? 'onboarding-narrow' : 'onboarding-medium'}`}>
        <header className="onboarding-header-row">
          <div>
            <p className="auth-eyebrow">Guided onboarding</p>
            <h2>{currentStep.prompt}</h2>
          </div>
          <p className="onboarding-progress">Step {stepNumber} of {ONBOARDING_STEPS.length}</p>
        </header>

        <label className="onboarding-field-label">
          {currentStep.label}{isMultiChoice ? ' (Select all that apply)' : ''}
          {currentStep.type !== 'choice' && currentStep.type !== 'multi-choice' && (
            currentStep.type === 'long' ? (
              <textarea
                value={form[currentStep.key]}
                onChange={(event) => updateField(currentStep.key, event.target.value)}
                placeholder={currentStep.placeholder}
                className="onboarding-textarea"
              />
            ) : (
              <input
                type="text"
                value={form[currentStep.key]}
                onChange={(event) => updateField(currentStep.key, event.target.value)}
                placeholder={currentStep.placeholder}
                className="onboarding-input"
              />
            )
          )}
        </label>

        {currentStep.type === 'choice' && (
          <div className="onboarding-choice-grid" role="radiogroup" aria-label={currentStep.label}>
            {currentStep.options.map((option) => (
              <button
                type="button"
                key={option}
                className={`onboarding-choice ${form[currentStep.key] === option ? 'selected' : ''}`}
                onClick={() => updateField(currentStep.key, option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {isMultiChoice && (
          <>
            <div className="onboarding-choice-grid onboarding-multi-choice-grid" role="group" aria-label={currentStep.label}>
              {currentStep.options.map((option) => {
                const selected = form.lifeStage.includes(option);
                return (
                  <button
                    type="button"
                    key={option}
                    className={`onboarding-choice ${selected ? 'selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleLifeStage(option)}
                  >
                    {option}
                  </button>
                );
              })}

              {customLifeStageActive ? (
                <div className="onboarding-custom-choice-input-wrap">
                  <input
                    type="text"
                    autoFocus
                    value={customLifeStageText}
                    onChange={(event) => setCustomLifeStageText(event.target.value)}
                    onKeyDown={handleCustomLifeStageKeyDown}
                    onBlur={commitCustomLifeStage}
                    placeholder="Type details and press Enter"
                    className="onboarding-custom-choice-input"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={`onboarding-choice onboarding-custom-choice ${form.lifeStage.some((item) => !LIFE_STAGE_OPTIONS.includes(item)) ? 'selected' : ''}`}
                  onClick={() => setCustomLifeStageActive(true)}
                >
                  {form.lifeStage.find((item) => !LIFE_STAGE_OPTIONS.includes(item)) || CUSTOM_LIFE_STAGE_LABEL}
                </button>
              )}
            </div>

            {form.lifeStage.length > 0 && (
              <div className="onboarding-selected-tags" aria-label="Selected life stage options">
                {form.lifeStage.map((tag) => (
                  <button key={tag} type="button" className="onboarding-selected-tag" onClick={() => removeLifeStage(tag)}>
                    {tag}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {mentorResponse && <p className="mentor-muted">{mentorResponse}</p>}

        <div className="onboarding-footer-row">
          <button
            type="button"
            className="entry-secondary-button"
            onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentIndex === 0}
          >
            Back
          </button>
          <button type="button" className="entry-primary-button" onClick={nextStep} disabled={!hasValue(form[currentStep.key])}>
            Continue
          </button>
        </div>
      </section>

      <aside className="onboarding-support-panel">
        <p className="auth-eyebrow">Support note</p>
        <h3>{SUPPORT_COPY[currentStep.type]}</h3>
        <p className="mentor-muted">
          These answers shape how Big SYZ reflects, prioritizes, and supports you once you enter the main app.
        </p>
      </aside>
    </main>
  );
};

export default OnboardingFlow;
