import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_STREAM_STATE = {
  status: 'idle',
  label: 'No signal captured',
  sampleCount: 0,
};

const DEFAULT_COHERENCE_VECTOR = {
  acoustic: DEFAULT_STREAM_STATE,
  kinetic: DEFAULT_STREAM_STATE,
  visual: DEFAULT_STREAM_STATE,
  contextual: DEFAULT_STREAM_STATE,
  coherenceScore: null,
  coherenceLabel: 'Pending',
  capturedAt: null,
};

const BiometricContext = createContext({
  coherenceVector: DEFAULT_COHERENCE_VECTOR,
  startAcousticStream: async () => DEFAULT_STREAM_STATE,
  stopAcousticStream: () => {},
  startVisualStream: async () => DEFAULT_STREAM_STATE,
  stopVisualStream: () => {},
  updateContextualMetrics: () => {},
  getLatestCoherencePayload: () => DEFAULT_COHERENCE_VECTOR,
});

const safeNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const average = (values = []) => {
  const cleanValues = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!cleanValues.length) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
};

const variance = (values = []) => {
  const mean = average(values);
  if (mean === null) return null;
  return average(values.map((value) => (value - mean) ** 2));
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const deriveAcousticLabel = ({ amplitudeStability, pitchVariance }) => {
  if (amplitudeStability === null && pitchVariance === null) return 'Unavailable';
  if ((amplitudeStability ?? 0) >= 72 && (pitchVariance ?? 0) <= 1800) return 'Aligned';
  if ((amplitudeStability ?? 0) < 42 || (pitchVariance ?? 0) > 4200) return 'Variable';
  return 'Settling';
};

const deriveKineticLabel = ({ dwellAverageMs, flightAverageMs }) => {
  if (dwellAverageMs === null && flightAverageMs === null) return 'Unavailable';
  if ((flightAverageMs ?? 0) > 650 || (dwellAverageMs ?? 0) > 420) return 'Erratic';
  if ((flightAverageMs ?? 0) < 260 && (dwellAverageMs ?? 0) < 260) return 'Aligned';
  return 'Transitional';
};

const deriveVisualLabel = ({ blinkFrequencyPerMinute, motionVelocity }) => {
  if (blinkFrequencyPerMinute === null && motionVelocity === null) return 'Unavailable';
  if ((blinkFrequencyPerMinute ?? 0) > 28 || (motionVelocity ?? 0) > 24) return 'Elevated';
  if ((blinkFrequencyPerMinute ?? 0) < 20 && (motionVelocity ?? 0) < 14) return 'Aligned';
  return 'Watchful';
};

const deriveContextualLabel = ({ sleepHours, stressLevel }) => {
  if (sleepHours === null && stressLevel === null) return 'Unavailable';
  if ((stressLevel ?? 0) >= 8 || (sleepHours !== null && sleepHours <= 4)) return 'Strained';
  if ((stressLevel ?? 10) <= 4 && (sleepHours ?? 0) >= 6) return 'Aligned';
  return 'Managed';
};

const scoreFromLabel = (label) => {
  if (['Aligned'].includes(label)) return 90;
  if (['Settling', 'Managed', 'Watchful', 'Transitional'].includes(label)) return 68;
  if (['Variable', 'Elevated', 'Strained', 'Erratic'].includes(label)) return 38;
  return null;
};

const buildCoherenceSummary = ({ acoustic, kinetic, visual, contextual }) => {
  const scores = [acoustic, kinetic, visual, contextual]
    .map((stream) => scoreFromLabel(stream?.label))
    .filter(Number.isFinite);
  const coherenceScore = scores.length ? Math.round(average(scores)) : null;
  let coherenceLabel = 'Pending';

  if (coherenceScore !== null) {
    if (coherenceScore >= 80) coherenceLabel = 'Aligned';
    else if (coherenceScore >= 55) coherenceLabel = 'Stabilizing';
    else coherenceLabel = 'Support Needed';
  }

  return { coherenceScore, coherenceLabel };
};

export function BiometricProvider({ children }) {
  const [coherenceVector, setCoherenceVector] = useState(DEFAULT_COHERENCE_VECTOR);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioAnimationRef = useRef(null);
  const acousticSamplesRef = useRef([]);
  const visualStreamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const visualAnimationRef = useRef(null);
  const visualSamplesRef = useRef([]);
  const previousFrameRef = useRef(null);
  const previousKeyDownAtRef = useRef(null);
  const activeKeyDownsRef = useRef(new Map());
  const dwellSamplesRef = useRef([]);
  const flightSamplesRef = useRef([]);
  const contextualRef = useRef(DEFAULT_STREAM_STATE);

  const mergeVector = useCallback((patch) => {
    setCoherenceVector((current) => {
      const next = {
        ...current,
        ...patch,
        capturedAt: new Date().toISOString(),
      };
      const summary = buildCoherenceSummary(next);
      return { ...next, ...summary };
    });
  }, []);

  const stopAcousticStream = useCallback(() => {
    if (audioAnimationRef.current) cancelAnimationFrame(audioAnimationRef.current);
    audioAnimationRef.current = null;
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    audioStreamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
  }, []);

  const startAcousticStream = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        const unavailable = { status: 'unavailable', label: 'Unavailable', error: 'Microphone capture is not supported in this browser.', sampleCount: 0 };
        mergeVector({ acoustic: unavailable });
        return unavailable;
      }

      stopAcousticStream();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const byteData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);
      audioStreamRef.current = stream;
      audioContextRef.current = audioContext;
      acousticSamplesRef.current = [];

      const analyze = () => {
        analyser.getByteFrequencyData(byteData);
        analyser.getByteTimeDomainData(timeData);

        const amplitudes = Array.from(timeData).map((value) => Math.abs(value - 128));
        const amplitude = average(amplitudes) || 0;
        const spectralTotal = Array.from(byteData).reduce((sum, value) => sum + value, 0) || 1;
        const centroid = Array.from(byteData).reduce((sum, value, index) => sum + index * value, 0) / spectralTotal;
        const samples = [...acousticSamplesRef.current, { amplitude, centroid }].slice(-90);
        acousticSamplesRef.current = samples;

        const amplitudeValues = samples.map((sample) => sample.amplitude);
        const centroidValues = samples.map((sample) => sample.centroid);
        const amplitudeStability = clamp(100 - (variance(amplitudeValues) || 0));
        const pitchVariance = Math.round((variance(centroidValues) || 0) * 100);
        const acoustic = {
          status: 'active',
          label: deriveAcousticLabel({ amplitudeStability, pitchVariance }),
          sampleCount: samples.length,
          amplitudeStability: Math.round(amplitudeStability),
          pitchVariance,
        };
        mergeVector({ acoustic });
        audioAnimationRef.current = requestAnimationFrame(analyze);
      };

      analyze();
      return { status: 'active', label: 'Listening', sampleCount: 0 };
    } catch (error) {
      const failed = {
        status: 'error',
        label: 'Unavailable',
        error: error?.message || 'Microphone permission was denied or failed.',
        sampleCount: 0,
      };
      mergeVector({ acoustic: failed });
      return failed;
    }
  }, [mergeVector, stopAcousticStream]);

  const stopVisualStream = useCallback(() => {
    if (visualAnimationRef.current) cancelAnimationFrame(visualAnimationRef.current);
    visualAnimationRef.current = null;
    if (visualStreamRef.current) {
      visualStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    visualStreamRef.current = null;
    previousFrameRef.current = null;
  }, []);

  const startVisualStream = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        const unavailable = { status: 'unavailable', label: 'Unavailable', error: 'Camera capture is not supported in this browser.', sampleCount: 0 };
        mergeVector({ visual: unavailable });
        return unavailable;
      }

      stopVisualStream();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: 160, height: 120, facingMode: 'user' } });
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error('Visual analysis elements are not ready.');

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      visualStreamRef.current = stream;
      visualSamplesRef.current = [];

      const context = canvas.getContext('2d');
      const width = 80;
      const height = 60;
      canvas.width = width;
      canvas.height = height;

      const analyze = () => {
        context.drawImage(video, 0, 0, width, height);
        const frame = context.getImageData(0, 0, width, height).data;
        const previous = previousFrameRef.current;
        let diff = 0;
        let brightness = 0;

        for (let index = 0; index < frame.length; index += 16) {
          const pixelBrightness = (frame[index] + frame[index + 1] + frame[index + 2]) / 3;
          brightness += pixelBrightness;
          if (previous) diff += Math.abs(pixelBrightness - previous[index / 4]);
        }

        const compactFrame = [];
        for (let index = 0; index < frame.length; index += 4) {
          compactFrame.push((frame[index] + frame[index + 1] + frame[index + 2]) / 3);
        }
        previousFrameRef.current = compactFrame;

        const sampleCount = compactFrame.length || 1;
        const motionVelocity = previous ? diff / sampleCount : 0;
        const averageBrightness = brightness / Math.max(1, Math.floor(frame.length / 16));
        const lastVisualSample = visualSamplesRef.current[visualSamplesRef.current.length - 1];
        const previousBrightness = lastVisualSample?.brightness;
        const blinkCandidate = previousBrightness && previousBrightness - averageBrightness > 18;
        const sample = { motionVelocity, brightness: averageBrightness, blink: Boolean(blinkCandidate), timestamp: Date.now() };
        const samples = [...visualSamplesRef.current, sample].slice(-180);
        visualSamplesRef.current = samples;

        const firstTimestamp = samples[0]?.timestamp || Date.now();
        const minutes = Math.max((Date.now() - firstTimestamp) / 60000, 1 / 60);
        const blinkFrequencyPerMinute = Math.round(samples.filter((item) => item.blink).length / minutes);
        const averagedVelocity = Math.round((average(samples.map((item) => item.motionVelocity)) || 0) * 100) / 100;
        const visual = {
          status: 'active',
          label: deriveVisualLabel({ blinkFrequencyPerMinute, motionVelocity: averagedVelocity }),
          sampleCount: samples.length,
          blinkFrequencyPerMinute,
          motionVelocity: averagedVelocity,
        };
        mergeVector({ visual });
        visualAnimationRef.current = requestAnimationFrame(analyze);
      };

      analyze();
      return { status: 'active', label: 'Scanning', sampleCount: 0 };
    } catch (error) {
      const failed = {
        status: 'error',
        label: 'Unavailable',
        error: error?.message || 'Camera permission was denied or failed.',
        sampleCount: 0,
      };
      mergeVector({ visual: failed });
      return failed;
    }
  }, [mergeVector, stopVisualStream]);

  const updateContextualMetrics = useCallback((metrics = {}) => {
    const sleepHours = safeNumber(metrics.sleep ?? metrics.sleepHours);
    const stressLevel = safeNumber(metrics.stress ?? metrics.stressLevel);
    const contextual = {
      status: 'active',
      label: deriveContextualLabel({ sleepHours, stressLevel }),
      sampleCount: 1,
      sleepHours,
      stressLevel,
      symptoms: String(metrics.symptoms || '').slice(0, 240),
    };
    contextualRef.current = contextual;
    mergeVector({ contextual });
  }, [mergeVector]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInputTarget = target?.matches?.('input, textarea, [contenteditable="true"]');
      if (!isInputTarget || event.repeat) return;

      const now = performance.now();
      if (previousKeyDownAtRef.current) {
        flightSamplesRef.current = [...flightSamplesRef.current, now - previousKeyDownAtRef.current].slice(-80);
      }
      previousKeyDownAtRef.current = now;
      activeKeyDownsRef.current.set(event.code, now);
    };

    const handleKeyUp = (event) => {
      const startedAt = activeKeyDownsRef.current.get(event.code);
      if (!startedAt) return;
      activeKeyDownsRef.current.delete(event.code);
      dwellSamplesRef.current = [...dwellSamplesRef.current, performance.now() - startedAt].slice(-80);

      const dwellAverageMs = Math.round(average(dwellSamplesRef.current) || 0);
      const flightAverageMs = Math.round(average(flightSamplesRef.current) || 0);
      const kinetic = {
        status: 'active',
        label: deriveKineticLabel({ dwellAverageMs, flightAverageMs }),
        rhythm: deriveKineticLabel({ dwellAverageMs, flightAverageMs }),
        dwellAverageMs,
        flightAverageMs,
        sampleCount: dwellSamplesRef.current.length,
      };
      mergeVector({ kinetic });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [mergeVector]);

  useEffect(() => () => {
    stopAcousticStream();
    stopVisualStream();
  }, [stopAcousticStream, stopVisualStream]);

  const getLatestCoherencePayload = useCallback(() => ({
    capturedAt: new Date().toISOString(),
    coherenceScore: coherenceVector.coherenceScore,
    coherenceLabel: coherenceVector.coherenceLabel,
    acoustic: coherenceVector.acoustic,
    kinetic: coherenceVector.kinetic,
    visual: coherenceVector.visual,
    contextual: coherenceVector.contextual,
    guidance: [
      'Derived biometric metrics only; no raw audio, video, images, or keystroke values are stored.',
      'Use as adaptive context, not diagnosis or identity verification.',
    ],
  }), [coherenceVector]);

  const value = useMemo(() => ({
    coherenceVector,
    startAcousticStream,
    stopAcousticStream,
    startVisualStream,
    stopVisualStream,
    updateContextualMetrics,
    getLatestCoherencePayload,
  }), [coherenceVector, getLatestCoherencePayload, startAcousticStream, startVisualStream, stopAcousticStream, stopVisualStream, updateContextualMetrics]);

  return (
    <BiometricContext.Provider value={value}>
      {children}
      <video ref={videoRef} aria-hidden="true" style={{ display: 'none' }} />
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'none' }} />
    </BiometricContext.Provider>
  );
}

export const useBiometric = () => useContext(BiometricContext);

export default BiometricContext;
