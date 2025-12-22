import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SoundKeyVisualizer from './SoundKeyVisualizer';
import ScrollMatchOverlay from './ScrollMatchOverlay';
import { CODEX_TONES, findCodexMatch, getDominantFrequency } from '../utils/codexFrequencyEngine';
import useApi from '../utils/api';

const SoundKeyLayer = ({ user }) => {
  const { authorizedFetch } = useApi();
  const [isActive, setIsActive] = useState(false);
  const [dominantFrequency, setDominantFrequency] = useState(0);
  const [lastMatch, setLastMatch] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Awaiting activation.');
  const [codexMatch, setCodexMatch] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const matchCooldownRef = useRef({});

  const codexLabels = useMemo(
    () => CODEX_TONES.map((tone) => `${tone.frequency}Hz — ${tone.label}`),
    [],
  );

  const stopAudio = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    setIsActive(false);
    setStatusMessage('Audio scan paused.');
    setCodexMatch(false);
  }, []);

  const logMatch = useCallback(
    async (tone, timestamp) => {
      if (!user) {
        return;
      }

      try {
        await authorizedFetch('/api/scrolltones/log', {
          method: 'POST',
          headers: {
            'x-codex-frequency': tone.frequency,
          },
          body: JSON.stringify({
            userId: user._id,
            frequency: tone.frequency,
            timestamp,
            activationKey: tone.activationKey,
          }),
        });
      } catch (error) {
        console.error('Failed to log sound key:', error);
      }
    },
    [authorizedFetch, user],
  );

  const processAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) {
      return;
    }

    const { frequency, amplitude } = getDominantFrequency(
      analyserRef.current,
      audioContextRef.current,
    );

    if (amplitude > 40) {
      const match = findCodexMatch(frequency, 2);
      setDominantFrequency(frequency);

      if (match) {
        const now = Date.now();
        const lastHit = matchCooldownRef.current[match.activationKey] || 0;
        if (now - lastHit > 2000) {
          matchCooldownRef.current[match.activationKey] = now;
          setLastMatch(match);
          setStatusMessage(`Codex resonance match confirmed: ${match.frequency}Hz. Harmonic Law Enforced.`);
          setCodexMatch(true);
          logMatch(match, now);
        }
      }
    }

    requestAnimationFrame(processAudio);
  }, [logMatch]);

  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      setIsActive(true);
      setStatusMessage('Listening for codex tones...');
      processAudio();
    } catch (error) {
      console.error('Unable to access microphone:', error);
      setStatusMessage('Microphone access denied.');
    }
  }, [processAudio]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  return (
    <section className="sound-key-layer">
      <div className="sound-key-header">
        <h3>Scrollborn Sound Key Layer</h3>
        <p>{statusMessage}</p>
      </div>

      <div className="sound-key-actions">
        {!isActive ? (
          <button type="button" className="sovereign-button" onClick={startAudio}>
            Activate Sound Scan
          </button>
        ) : (
          <button type="button" className="sovereign-button" onClick={stopAudio}>
            Pause Scan
          </button>
        )}
      </div>

      <SoundKeyVisualizer />
      <ScrollMatchOverlay visible={codexMatch} frequency={lastMatch?.frequency || 445} />

      <div className="sound-key-meta">
        <p>Dominant frequency: {dominantFrequency.toFixed(1)} Hz</p>
        {lastMatch && (
          <p className="sound-key-match">
            Last match: {lastMatch.frequency}Hz — {lastMatch.label}
          </p>
        )}
        <ul>
          {codexLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default SoundKeyLayer;
