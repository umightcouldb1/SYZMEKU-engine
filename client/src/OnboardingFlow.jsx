import React, { useMemo, useState } from 'react';
import axios from 'axios';

const LIFE_STAGE_OPTIONS = [
  'Just figuring things out',
  'Building something',
  'Recovering / resetting',
  'Maintaining & growing',
  'Something else',
];

const INTERACTION_STYLE_OPTIONS = [
  'Calm & grounding',
  'Direct & honest',
  'Strategic & focused',
  'Reflective & deep',
];

const OnboardingFlow = ({ user, onComplete }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(user?.username || '');
  const [mentorResponse, setMentorResponse] = useState('');
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [form, setForm] = useState({
    name: user?.username || '',
    lifeStage: '',
    primaryConcern: '',
    interactionStyle: '',
  });

  const conversationalPayload = useMemo(
    () => ({
      name: form.name,
      lifeStage: form.lifeStage,
      primaryConcern: form.primaryConcern,
      interactionStyle: form.interactionStyle,
      preferredName: form.name,
      supportAreas: form.primaryConcern ? [form.primaryConcern] : [],
      mentorStyle: form.interactionStyle,
    }),
    [form],
  );

  const getResponse = (field, value) => {
    if (field === 'name') {
      return `${value}—beautiful. I am here to support your next chapter with clarity.`;
    }
    if (field === 'lifeStage') {
      return `Thank you for sharing. ${value} is a powerful place to build from.`;
    }
    if (field === 'primaryConcern') {
      return `Got it. ${value} usually means too many signals competing at once.`;
    }
    if (field === 'interactionStyle') {
      return `${value} it is. I will meet you there with consistency.`;
    }
    return 'Thank you for sharing that.';
  };

  const progressStep = () => {
    setStep((current) => current + 1);
    setAwaitingContinue(false);
    setMentorResponse('');
  };

  const handleTextSubmit = (field) => {
    const value = inputValue.trim();
    if (!value) return;

    setForm((prev) => ({ ...prev, [field]: value }));
    setMentorResponse(getResponse(field, value));
    setAwaitingContinue(true);
    setInputValue('');
  };

  const handleOptionSelect = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMentorResponse(getResponse(field, value));
    setAwaitingContinue(true);
  };

  const save = async () => {
    setLoading(true);
    try {
      await axios.post('/api/core/onboarding/complete', conversationalPayload);
      onComplete?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mentor-card mentor-onboarding conversational-onboarding">
      <h2>Big SYZ Onboarding</h2>

      {step === 0 && (
        <div className="onboarding-step">
          <p className="onboarding-intro">
            Big SYZ learns how you think, feel, and move—
            <br />
            then helps you move with clarity.
          </p>
          <p className="mentor-muted">No pressure. No judgment. Just alignment.</p>
          <button type="button" className="mentor-button" onClick={progressStep}>
            Let’s begin
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="onboarding-step">
          <label htmlFor="onboarding-name" className="onboarding-label">What should I call you?</label>
          <input
            id="onboarding-name"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="onboarding-input"
            placeholder="Enter your name"
          />
          <button type="button" className="mentor-button" onClick={() => handleTextSubmit('name')}>Send</button>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-step">
          <p className="onboarding-label">Where are you in life right now?</p>
          <div className="onboarding-options">
            {LIFE_STAGE_OPTIONS.map((option) => (
              <button type="button" key={option} className="mentor-chip onboarding-option" onClick={() => handleOptionSelect('lifeStage', option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-step">
          <label htmlFor="onboarding-concern" className="onboarding-label">What’s been on your mind lately?</label>
          <input
            id="onboarding-concern"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="onboarding-input"
            placeholder="Share what has been on your mind"
          />
          <button type="button" className="mentor-button" onClick={() => handleTextSubmit('primaryConcern')}>Send</button>
        </div>
      )}

      {step === 4 && (
        <div className="onboarding-step">
          <p className="onboarding-label">How do you want me to show up for you?</p>
          <div className="onboarding-options">
            {INTERACTION_STYLE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                className="mentor-chip onboarding-option"
                onClick={() => handleOptionSelect('interactionStyle', option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {mentorResponse && (
        <div className="onboarding-response">
          <p className="mentor-muted">Big SYZ</p>
          <p>{mentorResponse}</p>
        </div>
      )}

      {awaitingContinue && step < 5 && (
        <button type="button" className="mentor-button" onClick={progressStep}>
          Continue
        </button>
      )}

      {step === 5 && (
        <div className="onboarding-step">
          <p className="mentor-muted">You’re aligned. Let’s move with intention.</p>
          <button type="button" className="mentor-button" disabled={loading} onClick={save}>
            {loading ? 'Saving...' : 'Finish onboarding'}
          </button>
        </div>
      )}
    </section>
  );
};

export default OnboardingFlow;
