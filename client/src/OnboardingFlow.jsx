import React, { useMemo, useState } from 'react';
import axios from 'axios';

const STEPS = [
  'welcome',
  'consent',
  'profile',
  'baseline',
  'goals',
  'signals',
  'insight',
];

const GOALS = ['focus', 'emotional clarity', 'planning', 'recovery', 'performance', 'self-mastery'];

const OnboardingFlow = ({ user, onComplete }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    preferredName: user?.username || '',
    lifeStage: '',
    supportAreas: [],
    mentorStyle: 'gentle',
    baseline: { sleep: 6, stress: 4, energy: 5, mood: '', symptoms: '', focusChallenge: '' },
    goals: [],
    signalSetup: 'manual',
  });

  const firstInsight = useMemo(() => {
    const highStress = Number(form.baseline.stress) >= 7;
    const lowSleep = Number(form.baseline.sleep) <= 5;
    if (highStress || lowSleep) {
      return 'You are carrying load. Start with one stabilizing step: reduce today to one must-win task and a short recovery block.';
    }
    return 'Your baseline is workable. Start with one clear priority and one reflective check-in tonight.';
  }, [form]);

  const save = async () => {
    setLoading(true);
    try {
      await axios.post('/api/core/onboarding/complete', form);
      onComplete?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mentor-card mentor-onboarding">
      <h2>Big SYZ Onboarding</h2>
      {STEPS[step] === 'welcome' && (
        <>
          <p>Big SYZ is your emotionally intelligent mentor, powered by the SYZMEKU Engine.</p>
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>Start</button>
        </>
      )}
      {STEPS[step] === 'consent' && (
        <>
          <p>Emotions are indicators, not commands. We read patterns and respond with support.</p>
          <p className="mentor-muted">Big SYZ provides non-diagnostic guidance and is not treatment.</p>
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>I understand</button>
        </>
      )}
      {STEPS[step] === 'profile' && (
        <>
          <input type="text" placeholder="Preferred name" value={form.preferredName} onChange={(e) => setForm({ ...form, preferredName: e.target.value })} />
          <input type="text" placeholder="Age range or life stage" value={form.lifeStage} onChange={(e) => setForm({ ...form, lifeStage: e.target.value })} />
          <input type="text" placeholder="What do you want help with?" onBlur={(e) => setForm({ ...form, supportAreas: [e.target.value].filter(Boolean) })} />
          <select value={form.mentorStyle} onChange={(e) => setForm({ ...form, mentorStyle: e.target.value })}>
            <option value="gentle">Gentle</option><option value="direct">Direct</option><option value="reflective">Reflective</option><option value="strategic">Strategic</option>
          </select>
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>Continue</button>
        </>
      )}
      {STEPS[step] === 'baseline' && (
        <>
          <label>Sleep ({form.baseline.sleep}h)</label><input type="range" min="0" max="12" value={form.baseline.sleep} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, sleep: Number(e.target.value) } })} />
          <label>Stress ({form.baseline.stress})</label><input type="range" min="0" max="10" value={form.baseline.stress} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, stress: Number(e.target.value) } })} />
          <label>Energy ({form.baseline.energy})</label><input type="range" min="0" max="10" value={form.baseline.energy} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, energy: Number(e.target.value) } })} />
          <input type="text" placeholder="Mood" value={form.baseline.mood} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, mood: e.target.value } })} />
          <input type="text" placeholder="Symptoms" value={form.baseline.symptoms} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, symptoms: e.target.value } })} />
          <input type="text" placeholder="Current focus challenge" value={form.baseline.focusChallenge} onChange={(e) => setForm({ ...form, baseline: { ...form.baseline, focusChallenge: e.target.value } })} />
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>Continue</button>
        </>
      )}
      {STEPS[step] === 'goals' && (
        <>
          <div className="mentor-quick-actions">{GOALS.map((goal) => <button type="button" key={goal} className="mentor-chip" onClick={() => setForm({ ...form, goals: form.goals.includes(goal) ? form.goals.filter((g) => g !== goal) : [...form.goals, goal] })}>{goal}</button>)}</div>
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>Continue</button>
        </>
      )}
      {STEPS[step] === 'signals' && (
        <>
          <p>Choose your signal source:</p>
          <div className="mentor-quick-actions">
            <button type="button" className="mentor-chip" onClick={() => setForm({ ...form, signalSetup: 'manual' })}>Manual check-in</button>
            <button type="button" className="mentor-chip" onClick={() => setForm({ ...form, signalSetup: 'connect_health' })}>Connect health data</button>
            <button type="button" className="mentor-chip" onClick={() => setForm({ ...form, signalSetup: 'skip' })}>Skip for now</button>
          </div>
          <button type="button" className="mentor-button" onClick={() => setStep(step + 1)}>Continue</button>
        </>
      )}
      {STEPS[step] === 'insight' && (
        <>
          <p><strong>First insight:</strong> {firstInsight}</p>
          <p className="mentor-muted"><strong>Next step:</strong> Tell Big SYZ what is most important in the next 24 hours.</p>
          <button type="button" className="mentor-button" disabled={loading} onClick={save}>{loading ? 'Saving...' : 'Finish onboarding'}</button>
        </>
      )}
    </section>
  );
};

export default OnboardingFlow;
