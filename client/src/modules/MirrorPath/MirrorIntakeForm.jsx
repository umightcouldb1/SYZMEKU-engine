import { useState } from 'react';

const MirrorIntakeForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    username: '',
    birthDate: '',
    soundKeyResonance: '',
    scrollRank: '',
    glyphAlignment: '',
    dominantEmotion: '',
    futureIntent: '',
  });

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (onSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <section className="mirror-intake-card">
      <h3>Mirror Intake</h3>
      <form onSubmit={handleSubmit} className="mirror-intake-form">
        <input
          name="username"
          placeholder="Username or Codex Name"
          onChange={handleChange}
          value={formData.username}
          required
        />
        <input
          name="birthDate"
          type="date"
          placeholder="Date of Birth"
          onChange={handleChange}
          value={formData.birthDate}
          required
        />
        <input
          name="soundKeyResonance"
          placeholder="Sound Key Resonance (Describe or Upload Link)"
          onChange={handleChange}
          value={formData.soundKeyResonance}
        />
        <input
          name="scrollRank"
          placeholder="ScrollRank (1-9)"
          onChange={handleChange}
          value={formData.scrollRank}
        />
        <input
          name="glyphAlignment"
          placeholder="Primary Glyph Alignment"
          onChange={handleChange}
          value={formData.glyphAlignment}
        />
        <input
          name="dominantEmotion"
          placeholder="What emotion do you lead with?"
          onChange={handleChange}
          value={formData.dominantEmotion}
        />
        <input
          name="futureIntent"
          placeholder="What do you seek to anchor in this reality?"
          onChange={handleChange}
          value={formData.futureIntent}
        />
        <button type="submit" className="sovereign-button">
          Submit
        </button>
      </form>
    </section>
  );
};

export default MirrorIntakeForm;
