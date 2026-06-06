import React, { useEffect, useMemo, useState } from 'react';
import './onboardingVoiceBridge.css';

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const getConcernTextarea = () => {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.onboarding-textarea');
};

const writeTextareaValue = (textarea, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
};

const speakText = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 0.98;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
};

const OnboardingVoiceBridge = () => {
  const SpeechRecognition = useMemo(() => getSpeechRecognition(), []);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [visible, setVisible] = useState(false);
  const supported = Boolean(SpeechRecognition);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const syncVisibility = () => {
      setVisible(Boolean(getConcernTextarea()));
    };

    syncVisibility();
    const observer = new MutationObserver(syncVisibility);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let lastSpoken = '';
    const readFeedback = () => {
      if (!voiceEnabled) return;
      const feedback = document.querySelector('.sovereign-feedback-panel p')?.textContent?.trim() || '';
      if (feedback && feedback !== lastSpoken) {
        lastSpoken = feedback;
        speakText(feedback);
      }
    };

    readFeedback();
    const observer = new MutationObserver(readFeedback);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      window.speechSynthesis?.cancel();
    };
  }, [voiceEnabled]);

  const startListening = () => {
    const textarea = getConcernTextarea();
    if (!supported || !textarea || listening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    const baseValue = textarea.value.trim();
    let finalTranscript = '';
    setListening(true);

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const nextChunk = `${finalTranscript}${interimTranscript}`.trim();
      const nextValue = [baseValue, nextChunk].filter(Boolean).join(baseValue ? ' ' : '');
      writeTextareaValue(textarea, nextValue);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  if (!visible) return null;

  return (
    <div className="onboarding-voice-bridge" aria-live="polite">
      <button
        type="button"
        className={`onboarding-voice-button${listening ? ' listening' : ''}`}
        onClick={startListening}
        disabled={!supported || listening}
        title={supported ? 'Speak your current concern' : 'Voice input is not supported in this browser'}
      >
        {listening ? 'Listening...' : 'Speak concern'}
      </button>
      <button
        type="button"
        className={`onboarding-voice-toggle${voiceEnabled ? ' active' : ''}`}
        onClick={() => setVoiceEnabled((value) => !value)}
        title="Toggle spoken Sovereign Feedback"
      >
        {voiceEnabled ? 'Voice reply on' : 'Voice reply off'}
      </button>
    </div>
  );
};

export default OnboardingVoiceBridge;
