import { useState } from 'react';
import useApi from '../../utils/api';

const ScrollIntakeForm = () => {
  const { authorizedFetch } = useApi();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    dob: '',
    frequency: '',
    codex_intent: '',
    shadow_code: '',
    resonance_color: '',
    source: 'user',
  });
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResponse(null);

    try {
      const responseData = await authorizedFetch('/api/scroll-intake', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          frequency: Number(formData.frequency),
        }),
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
      <h3>Scroll Intake</h3>
      <form onSubmit={handleSubmit} className="mirror-intake-form">
        <input name="name" placeholder="Name" onChange={handleChange} value={formData.name} required />
        <input name="email" type="email" placeholder="Email" onChange={handleChange} value={formData.email} required />
        <input name="dob" type="date" onChange={handleChange} value={formData.dob} required />
        <input name="frequency" placeholder="Frequency (Hz)" onChange={handleChange} value={formData.frequency} required />
        <input name="codex_intent" placeholder="Codex intent" onChange={handleChange} value={formData.codex_intent} />
        <input name="shadow_code" placeholder="Shadow code" onChange={handleChange} value={formData.shadow_code} />
        <input name="resonance_color" placeholder="Resonance color" onChange={handleChange} value={formData.resonance_color} />
        <button type="submit" className="sovereign-button">Submit Intake</button>
      </form>
      {error && <p className="error-message">{error}</p>}
      {response && (
        <div className="result-box">
          <p><strong>Match Confirmed:</strong> {response.matchConfirmed ? 'Yes' : 'No'}</p>
          <p><strong>Scroll Assignment:</strong> {response.scrollAssignment || 'Pending'}</p>
        </div>
      )}
    </section>
  );
};

export default ScrollIntakeForm;
