import React, { useMemo, useState } from 'react';
import axios from 'axios';

const LIFE_STAGE_OPTIONS = [
  'I’m figuring things out',
  'I’m building something meaningful',
  'I’m recovering and resetting',
  'I’m maintaining momentum',
  'Something else',
];

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
    type: 'choice',
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
};

const getResponse = (field, value) => {
  if (field === 'name') return `${value}—great to meet you. We’ll build your guidance around that identity.`;
  if (field === 'lifeStage') return `Thank you for naming that. ${value} gives us an honest starting point.`;
  if (field === 'primaryConcern') return 'I hear that. We’ll turn this signal into practical direction.';
  if (field === 'interactionStyle') return `${value} works. I’ll keep that tone consistent with you.`;
  if (field === 'goals') return 'Clear direction. We can now translate this into daily aligned momentum.';
  return 'Thank you for sharing that.';
};

const OnboardingFlow = ({ user, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mentorResponse, setMentorResponse] = useState('');
  const [form, setForm] = useState({
    name: user?.username || '',
    lifeStage: '',
    primaryConcern: '',
    interactionStyle: '',
    goals: '',
  });

  const currentStep = ONBOARDING_STEPS[currentIndex];

  const payload = useMemo(
    () => ({
      name: form.name,
      lifeStage: form.lifeStage,
      primaryConcern: form.primaryConcern,
      interactionStyle: form.interactionStyle,
      goals: form.goals,
      preferredName: form.name,
      supportAreas: [form.primaryConcern, form.goals].filter(Boolean),
      mentorStyle: form.interactionStyle,
    }),
    [form],
  );

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const nextStep = () => {
    const value = String(form[currentStep.key] || '').trim();
    if (!value) return;
    setMentorResponse(getResponse(currentStep.key, value));
    setCurrentIndex((prev) => prev + 1);
  };

  const save = async () => {
    setLoading(true);
    try {
      await axios.post('/api/core/onboarding/complete', payload);
      onComplete?.();
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
          <button type="button" className="entry-primary-button" disabled={loading} onClick={save}>
            {loading ? 'Saving...' : 'Enter Big SYZ home'}
          </button>
        </section>
      </main>
    );
  }

  const stepNumber = currentIndex + 1;
  const isShort = currentStep.type === 'short';
  const isLong = currentStep.type === 'long';

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
          {currentStep.label}
          {currentStep.type !== 'choice' && (
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

        <div className="onboarding-footer-row">
          <button type="button" className="entry-primary-button" onClick={nextStep}>Continue</button>
          {mentorResponse && <p className="mentor-muted">Big SYZ: {mentorResponse}</p>}
        </div>
      </section>

      <aside className="onboarding-support-panel">
        <h3>Why this matters</h3>
        <p>{SUPPORT_COPY[currentStep.type]}</p>
        <p className="mentor-muted">Your responses are used to personalize guidance and are handled with privacy-first defaults.</p>
        <p className="mentor-muted">Current step: {currentStep.label}</p>
      </aside>
    </main>
  );
};

export default OnboardingFlow;
