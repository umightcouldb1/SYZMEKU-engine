import { useEffect, useState } from 'react';
import { matchResonanceHash } from '../utils/codexValidator';

export default function SoundKeyGate({ audioInput, onAuthorized }) {
  const [status, setStatus] = useState('Listening');

  useEffect(() => {
    if (!audioInput) {
      return;
    }

    const validateResonance = async () => {
      const result = await matchResonanceHash(audioInput);

      if (result?.authLevel === 'sovereign') {
        setStatus('Access Granted');
        if (onAuthorized) {
          onAuthorized();
        }
      } else {
        setStatus('Limited Mode');
      }
    };

    validateResonance();
  }, [audioInput, onAuthorized]);

  return <div className="status-display">{status}</div>;
}
