import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './interactionEnhancements.css';
import './onboardingPrism.css';

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
    label: 'Current core concern',
    placeholder: 'Share what feels most vital to untangle or prioritize right now',
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

const generateSystemReflection = (stages = []) => {
  if (!stages.length) {
    return 'Acknowledging system connection. Let’s explore your current vector alignment with patience and precision.';
  }

  const lowerStages = stages.map((stage) => stage.toLowerCase());
  const hasBuilding = lowerStages.some((stage) => stage.includes('building'));
  const hasFiguring = lowerStages.some((stage) => stage.includes('figuring'));
  const hasResetting = lowerStages.some((stage) => stage.includes('recovering') || stage.includes('reset'));
  const hasMomentum = lowerStages.some((stage) => stage.includes('momentum'));
  const hasCustom = stages.some((stage) => !LIFE_STAGE_OPTIONS.includes(stage));

  if (hasBuilding && hasResetting) {
    return 'Balancing construction with deep structural restoration takes real internal capacity. We will tune the engine to protect your energy while supporting what you are building.';
  }

  if (hasBuilding && hasMomentum) {
    return 'Your field is oriented toward expansion and continuity. Big SYZ will prioritize operational momentum without letting speed outrun alignment.';
  }

  if (hasBuilding) {
    return 'Focusing coordinates on manifestation and expansion. Big SYZ is calibrating around operational momentum and the architecture you are bringing into form.';
  }

  if (hasResetting || hasFiguring) {
    return 'A season of calibration is not a delay. It is a tactical position for restoring clarity, protecting signal quality, and choosing the next move with intention.';
  }

  if (hasCustom) {
    return 'You named a more specific coordinate than the default grid could hold. Big SYZ will keep that signal visible as we map what needs attention next.';
  }

  return `Acknowledging your current alignment with ${formatValue(stages)}. Let’s map the emotional bandwidth around that field with care.`;
};

const getResponse = (field, value) => {
  const displayValue = formatValue(value);
  if (field === 'name') return `${displayValue}—great to meet you. We’ll build your guidance around that identity.`;
  if (field === 'lifeStage') return generateSystemReflection(Array.isArray(value) ? value : [value].filter(Boolean));
  if (field === 'primaryConcern') return 'That signal is received. We’ll translate it into guidance that is specific enough to move with.';
  if (field === 'interactionStyle') return `${displayValue} works. I’ll keep that tone consistent with you.`;
  if (field === 'goals') return 'Clear direction. We can now translate this into daily aligned momentum.';
  return 'Thank you for sharing that.';
};

const SacredGeometryMandala = () => (
  <div className="sacred-mandala" aria-hidden="true">
    <svg viewBox="0 0 100 100" focusable="false">
      <defs>
        <linearGradient id="onboardingPrismGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#ec4899" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.24" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="35" className="mandala-glow grid-pulse mandala-glow-purple" />
      <circle cx="50" cy="50" r="25" className="mandala-glow grid-pulse mandala-glow-cyan" />
      <g className="mandala-layer-1" stroke="url(#onboardingPrismGrad)" strokeWidth="0.15" fill="none">
        {Array.from({ length: 12 }).map((_, index) => (
          <circle key={`circle-${index}`} cx="50" cy="50" r="30" transform={`rotate(${index * 30} 50 50)`} />
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <polygon
            key={`polygon-${index}`}
            points="50,15 80,32.5 80,67.5 50,85 20,67.5 20,32.5"
            transform={`rotate(${index * 15} 50 50)`}
          />
        ))}
      </g>
      <g className="mandala-layer-2" stroke="url(#onboardingPrismGrad)" strokeWidth="0.2" fill="none">
        {Array.from({ length: 8 }).map((_, index) => (
          <rect key={`rect-${index}`} x="30" y="30" width="40" height="40" transform={`rotate(${index * 45} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="10" stroke="#22d3ee" strokeWidth="0.1" strokeDasharray="1,1" />
      </g>
    </svg>
  </div>
);

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
  delete axios.defaults.headers.common.Authorization;
};

const getStoredToken = (user = null) => user?.token || localStorage.getItem('token') || '';

const hasValue = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim()));

const formatStageCode = (stepNumber) => `STAGE_${String(stepNumber).padStart(2, '0')} // ${String(ONBOARDING_STEPS.length).padStart(2, '0')}`;

const OnboardingFlow = ({ user, onComplete, appHomeRoute = '/app' }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mentorResponse, setMentorResponse] = useState('');
  const [smartReflection, setSmartReflection] = useState('');
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
      onboardingReflection: smartReflection,
      sovereignMatrixNote: smartReflection,
    }),
    [form, smartReflection],
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

  const getOnboardingReflection = async () => {
    const fallback = generateSystemReflection(form.lifeStage);

    try {
      const response = await axios.post('/api/onboarding', {
        choices: form.lifeStage,
        typedText: form.primaryConcern,
      });

      return response.data?.customAnswer || fallback;
    } catch (error) {
      console.warn('[onboarding] Gemini reflection fallback', error?.response?.data?.message || error?.message);
      return fallback;
    }
  };

  const nextStep = async () => {
    const value = form[currentStep.key];
    if (!hasValue(value) || loading) return;

    if (currentStep.key === 'primaryConcern') {
      setLoading(true);
      const reflection = await getOnboardingReflection();
      setSmartReflection(reflection);
      setMentorResponse(reflection);
      setLoading(false);
      setCurrentIndex((prev) => prev + 1);
      return;
    }

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
      const profileContextResponse = await axios.post('/api/onboarding/profile-context', payload).catch(() => ({ data: null }));
      const completionData = {
        ...completionResponse.data,
        onboarding: profileContextResponse.data?.onboarding || completionResponse.data?.onboarding,
      };
      const syncResult = await onComplete?.(completionData);
      const onboardingComplete = Boolean(syncResult?.completed ?? completionData?.onboarding?.completed);

      console.info('[onboarding] completion flow success', {
        completed: onboardingComplete,
        source: syncResult?.source || 'component',
        targetRoute: syncResult?.targetRoute || appHomeRoute,
        matrixContextSaved: Boolean(profileContextResponse.data?.onboarding?.profile?.sovereignMatrixNote),
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
      <main className="onboarding-shell onboarding-prism-shell">
        <SacredGeometryMandala />
        <section className="onboarding-stage onboarding-wide onboarding-prism-card">
          <div className="iridescent-shimmer" />
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
  const isConcernStep = currentStep.key === 'primaryConcern';
  const currentReflection = smartReflection || generateSystemReflection(form.lifeStage);

  return (
    <main className="onboarding-shell onboarding-prism-shell">
      <SacredGeometryMandala />
      <section className={`onboarding-stage onboarding-prism-card ${isLong ? 'onboarding-wide' : isShort ? 'onboarding-narrow' : 'onboarding-medium'}`}>
        <div className="iridescent-shimmer" />
        <header className="onboarding-header-row">
          <div>
            <p className="auth-eyebrow">{isConcernStep ? 'System Discernment' : 'Guided Onboarding'}</p>
            <h2>{currentStep.prompt}</h2>
          </div>
          <p className="onboarding-progress">{formatStageCode(stepNumber)}</p>
        </header>

        {isConcernStep && (
          <div className="sovereign-feedback-panel">
            <span>■ Sovereign Feedback //</span>
            <p>{currentReflection}</p>
          </div>
        )}

        <label className="onboarding-field-label">
          {isMultiChoice ? '[ Select all frequency fields that apply ]' : currentStep.label}
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
                    placeholder="Type vector details and press Enter"
                    className="onboarding-custom-choice-input"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={`onboarding-choice onboarding-custom-choice ${form.lifeStage.some((item) => !LIFE_STAGE_OPTIONS.includes(item)) ? 'selected' : ''}`}
                  onClick={() => setCustomLifeStageActive(true)}
                >
                  {form.lifeStage.find((item) => !LIFE_STAGE_OPTIONS.includes(item)) || `${CUSTOM_LIFE_STAGE_LABEL} +`}
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

        {mentorResponse && !isConcernStep && <p className="mentor-muted mentor-response-line">{mentorResponse}</p>}

        <div className="onboarding-footer-row">
          <button
            type="button"
            className="entry-secondary-button"
            onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentIndex === 0 || loading}
          >
            Back
          </button>
          <button type="button" className="entry-primary-button" onClick={nextStep} disabled={!hasValue(form[currentStep.key]) || loading}>
            {loading ? 'Synchronizing...' : isConcernStep ? 'Synchronize Matrix' : 'Continue'}
          </button>
        </div>
      </section>

      <aside className="onboarding-support-panel onboarding-prism-support">
        <p className="auth-eyebrow">System Matrix Note</p>
        <h3>{SUPPORT_COPY[currentStep.type]}</h3>
        <p className="mentor-muted">
          These metrics tune how Big SYZ reflects, prioritizes, and supports you once interface authorization is complete.
        </p>
      </aside>
    </main>
  );
};

export default OnboardingFlow;