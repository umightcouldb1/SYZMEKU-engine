import { useMemo, useState } from 'react';
import useApi from '../../utils/api';

const DIMENSION_FLOW = [
  {
    phase: 'Phase 1 — Essential Intake',
    id: 'identity_anchor',
    title: '1. Identity Anchor',
    functionType: 'interpretation',
    fields: [
      { name: 'name', label: 'Full name', required: true },
      { name: 'chosen_name', label: 'Chosen / spiritual name' },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'dob', label: 'Date of birth', type: 'date', required: true },
      { name: 'birth_time', label: 'Birth time (if known)', type: 'time' },
      { name: 'birth_location', label: 'Birth location' },
      { name: 'pronouns', label: 'Pronouns / identity language' },
    ],
  },
  {
    phase: 'Phase 1 — Essential Intake',
    id: 'core_intent',
    title: '3. Core Intent',
    functionType: 'execution',
    fields: [
      { name: 'why_here', label: 'Why did you come to the mentor?', type: 'textarea', required: true },
      { name: 'top_outcomes', label: 'Top 3 desired outcomes', type: 'textarea' },
      { name: 'desired_transformation', label: 'Transformation you want', type: 'textarea' },
      { name: 'repeat_pattern', label: 'What are you tired of repeating?', type: 'textarea' },
      { name: 'alignment_definition', label: 'What does alignment mean to you?', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 1 — Essential Intake',
    id: 'behavioral_rhythm',
    title: '4. Behavioral Rhythm',
    functionType: 'regulation',
    fields: [
      { name: 'sleep_rhythm', label: 'Sleep rhythm' },
      { name: 'energy_highs_lows', label: 'Energy highs/lows' },
      { name: 'day_preference', label: 'Morning vs night preference' },
      { name: 'work_style', label: 'Work style' },
      { name: 'decision_style', label: 'Decision style' },
      { name: 'stress_shutdown_pattern', label: 'Shutdown pattern under stress', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 1 — Essential Intake',
    id: 'emotional_patterning',
    title: '5. Emotional Patterning',
    functionType: 'regulation',
    fields: [
      { name: 'dominant_emotions', label: 'Dominant emotional patterns' },
      { name: 'common_triggers', label: 'Common triggers', type: 'textarea' },
      { name: 'conflict_style', label: 'Conflict style' },
      { name: 'attachment_tendencies', label: 'Attachment tendencies' },
      { name: 'emotional_recovery_style', label: 'Emotional recovery style' },
      { name: 'safety_markers', label: 'What makes you feel safe / unsafe?', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 1 — Essential Intake',
    id: 'readiness_constraint',
    title: '12. Readiness / Constraint Layer',
    functionType: 'execution',
    fields: [
      { name: 'time_per_day', label: 'Available time per day' },
      { name: 'current_resources', label: 'Current resources' },
      { name: 'biggest_obstacle', label: 'Biggest real-world obstacle', type: 'textarea' },
      { name: 'consistency_level', label: 'Consistency level' },
      { name: 'follow_through_support', label: 'Support you will actually follow' },
      { name: 'hard_no', label: 'What you absolutely will not do', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 2 — Symbolic Intake',
    id: 'symbolic_spiritual_framework',
    title: '8. Symbolic / Spiritual Framework',
    functionType: 'interpretation',
    fields: [
      { name: 'spiritual_orientation', label: 'Spiritual orientation' },
      { name: 'existing_practices', label: 'Practices you already use', type: 'textarea' },
      { name: 'resonant_symbols', label: 'Symbols you resonate with' },
      { name: 'rejected_beliefs', label: 'Belief systems you reject' },
      { name: 'esoteric_interests', label: 'Ancestral / occult / esoteric interests' },
      { name: 'symbolic_interpretation_level', label: 'Interpretation depth (heavy/light/none)' },
    ],
  },
  {
    phase: 'Phase 2 — Symbolic Intake',
    id: 'astrology_numerology_inputs',
    title: '9. Astrology / Numerology Inputs',
    functionType: 'interpretation',
    fields: [
      { name: 'legal_name_birth', label: 'Legal name at birth' },
      { name: 'current_chosen_name', label: 'Current chosen name' },
      { name: 'meaningful_dates', label: 'Major meaningful dates', type: 'textarea' },
      { name: 'codex_intent', label: 'Codex intent' },
      { name: 'shadow_code', label: 'Shadow code' },
      { name: 'frequency', label: 'Frequency (Hz)', type: 'number' },
    ],
  },
  {
    phase: 'Phase 2 — Symbolic Intake',
    id: 'color_aesthetic_psychology',
    title: '10. Color / Aesthetic Psychology',
    functionType: 'regulation',
    fields: [
      { name: 'favorite_color', label: 'Favorite color' },
      { name: 'most_worn_colors', label: 'Most-worn colors' },
      { name: 'colors_avoided', label: 'Colors avoided' },
      { name: 'confidence_colors', label: 'Colors tied to confidence' },
      { name: 'sadness_colors', label: 'Colors tied to sadness/fatigue' },
      { name: 'space_palette', label: 'Bedroom/workspace color palette' },
      { name: 'metals_textures_shapes', label: 'Metals / textures / shapes you are drawn to' },
      { name: 'resonance_color', label: 'Resonance color' },
    ],
  },
  {
    phase: 'Phase 3 — Regulation Intake',
    id: 'somatic_sensory_signals',
    title: '7. Somatic / Sensory Signals',
    functionType: 'regulation',
    fields: [
      { name: 'chronic_stress_signals', label: 'Chronic stress signals', type: 'textarea' },
      { name: 'physical_sensitivity', label: 'Physical sensitivity' },
      { name: 'sound_sensitivity', label: 'Sound sensitivity' },
      { name: 'light_sensitivity', label: 'Light sensitivity' },
      { name: 'sensory_overload_patterns', label: 'Sensory overload patterns' },
      { name: 'off_body_signs', label: 'Body signs that something is off', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 3 — Regulation Intake',
    id: 'sound_frequency_preferences',
    title: '11. Sound / Frequency Preferences',
    functionType: 'regulation',
    fields: [
      { name: 'music_preferences', label: 'Music preferences' },
      { name: 'calming_sounds', label: 'Sounds that calm you' },
      { name: 'irritating_sounds', label: 'Sounds that irritate you' },
      { name: 'silence_vs_ambient', label: 'Silence vs ambient preference' },
      { name: 'rhythm_sensitivity', label: 'Rhythm sensitivity' },
      { name: 'tone_openness', label: 'Openness to tones, binaural, chanting, nature sounds' },
    ],
  },
  {
    phase: 'Phase 3 — Regulation Intake',
    id: 'life_context',
    title: '2. Life Context',
    functionType: 'execution',
    fields: [
      { name: 'current_roles', label: 'Current role(s)' },
      { name: 'relationship_status', label: 'Relationship status' },
      { name: 'dependents', label: 'Children / dependents' },
      { name: 'current_pressures', label: 'Major current pressures', type: 'textarea' },
      { name: 'support_area', label: 'Main area seeking support' },
      { name: 'current_instability', label: 'What feels unstable right now?', type: 'textarea' },
    ],
  },
  {
    phase: 'Phase 3 — Regulation Intake',
    id: 'cognitive_style',
    title: '6. Cognitive Style',
    functionType: 'interpretation',
    fields: [
      { name: 'thinking_lean', label: 'Intuitive vs analytical lean' },
      { name: 'scale_preference', label: 'Big-picture vs detail-first' },
      { name: 'overthinking_patterns', label: 'Overthinking patterns' },
      { name: 'learning_style', label: 'Learning style' },
      { name: 'memory_style', label: 'Memory style' },
      { name: 'overwhelm_causes', label: 'What causes mental overwhelm?', type: 'textarea' },
    ],
  },
];

const INITIAL_DATA = DIMENSION_FLOW.reduce((acc, section) => {
  section.fields.forEach((field) => {
    acc[field.name] = '';
  });
  return acc;
}, { source: 'user' });

const ScrollIntakeForm = () => {
  const { authorizedFetch } = useApi();
  const [formData, setFormData] = useState(INITIAL_DATA);
  const [stepIndex, setStepIndex] = useState(0);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const currentStep = DIMENSION_FLOW[stepIndex];
  const isLastStep = stepIndex === DIMENSION_FLOW.length - 1;
  const phaseProgress = useMemo(
    () => DIMENSION_FLOW.filter((section) => section.phase === currentStep.phase),
    [currentStep.phase],
  );

  const handleChange = (event) => {
    setFormData((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }));
  };

  const goNext = () => {
    const missing = currentStep.fields.find((field) => field.required && !String(formData[field.name] || '').trim());
    if (missing) {
      setError(`Please complete required field: ${missing.label}`);
      return;
    }
    setError('');
    setStepIndex((prev) => Math.min(prev + 1, DIMENSION_FLOW.length - 1));
  };

  const goBack = () => {
    setError('');
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResponse(null);

    try {
      const payload = {
        ...formData,
        frequency: formData.frequency ? Number(formData.frequency) : null,
        mentor_intake: {
          phaseModel: ['Essential Intake', 'Symbolic Intake', 'Regulation Intake'],
          functionRule: ['interpretation', 'regulation', 'execution'],
          dimensions: DIMENSION_FLOW.map((section) => ({
            id: section.id,
            phase: section.phase,
            functionType: section.functionType,
            values: section.fields.reduce((acc, field) => {
              acc[field.name] = formData[field.name] || '';
              return acc;
            }, {}),
          })),
        },
      };

      const responseData = await authorizedFetch('/api/scroll-intake', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await responseData.json();

      if (!responseData.ok) {
        throw new Error(data.message || 'Scroll intake failed.');
      }

      setResponse(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="mirror-intake-card">
      <h3>SYZMEKU Mentor Intake</h3>
      <p className="intake-phase-label">{currentStep.phase}</p>
      <p className="intake-step-counter">Step {stepIndex + 1} / {DIMENSION_FLOW.length} · {currentStep.functionType}</p>
      <form onSubmit={handleSubmit} className="mirror-intake-form">
        <h4>{currentStep.title}</h4>
        {currentStep.fields.map((field) => (
          field.type === 'textarea' ? (
            <textarea
              key={field.name}
              name={field.name}
              placeholder={field.label}
              onChange={handleChange}
              value={formData[field.name]}
              required={field.required}
            />
          ) : (
            <input
              key={field.name}
              name={field.name}
              type={field.type || 'text'}
              placeholder={field.label}
              onChange={handleChange}
              value={formData[field.name]}
              required={field.required}
            />
          )
        ))}

        <div className="intake-actions">
          <button type="button" className="sovereign-button" onClick={goBack} disabled={stepIndex === 0}>Back</button>
          {!isLastStep ? (
            <button type="button" className="sovereign-button" onClick={goNext}>Next</button>
          ) : (
            <button type="submit" className="sovereign-button">Submit Intake</button>
          )}
        </div>
      </form>

      <div className="intake-phase-progress">
        {phaseProgress.map((section) => (
          <span key={section.id} className={section.id === currentStep.id ? 'active' : ''}>{section.title}</span>
        ))}
      </div>

      {error && <p className="error-message">{error}</p>}
      {response && (
        <div className="result-box">
          <p><strong>Match Confirmed:</strong> {response.matchConfirmed ? 'Yes' : 'No'}</p>
          <p><strong>Scroll Assignment:</strong> {response.scrollAssignment || 'Pending'}</p>
          <p><strong>Status:</strong> {response.status}</p>
        </div>
      )}
    </section>
  );
};

export default ScrollIntakeForm;
