import React, { useState } from 'react';
import useApi from '../utils/api';

const CrystallineGridTrigger = ({ user }) => {
  const { authorizedFetch } = useApi();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTrigger = async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    setStatus('');

    try {
      const response = await authorizedFetch('/api/crystalline/trigger-crystalline-grid', {
        method: 'POST',
        headers: {
          'x-codex-frequency': 445,
        },
        body: JSON.stringify({ frequency: 445, user_id: user._id || user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Crystalline grid trigger failed.');
      }

      setStatus('Crystalline grid activated.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="crystalline-panel">
      <button type="button" onClick={handleTrigger} disabled={loading}>
        {loading ? 'TRANSMITTING...' : 'activate earth crystalline grid'}
      </button>
      {status && <p>{status}</p>}
    </div>
  );
};

export default CrystallineGridTrigger;
