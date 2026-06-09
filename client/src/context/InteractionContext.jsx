import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

const MAX_EVENT_LOG = 40;

const initialInteractionState = {
  sessionStartedAt: Date.now(),
  lastInteractionAt: null,
  clickCount: 0,
  dropdownSelections: {},
  sliderAdjustments: {},
  inputSignals: {},
  moduleEngagement: {},
  eventLog: [],
};

const InteractionContext = createContext(null);

const normalizeKey = (value, fallback = 'global') => String(value || fallback).trim() || fallback;

const numericValue = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const createEvent = (type, payload, timestamp) => ({
  type,
  target: normalizeKey(payload.target || payload.name || type),
  module: normalizeKey(payload.module),
  value: payload.value === undefined ? null : String(payload.value).slice(0, 80),
  timestamp,
});

const addEvent = (eventLog, event) => [...eventLog, event].slice(-MAX_EVENT_LOG);

const interactionReducer = (state, action) => {
  if (action.type !== 'TRACK_INTERACTION') return state;

  const timestamp = Date.now();
  const eventType = normalizeKey(action.eventType, 'interaction');
  const payload = action.payload || {};
  const target = normalizeKey(payload.target || payload.name || eventType);
  const moduleName = normalizeKey(payload.module || payload.scope || 'global');
  const nextState = {
    ...state,
    lastInteractionAt: timestamp,
    moduleEngagement: {
      ...state.moduleEngagement,
      [moduleName]: (state.moduleEngagement[moduleName] || 0) + 1,
    },
    eventLog: addEvent(state.eventLog, createEvent(eventType, { ...payload, target, module: moduleName }, timestamp)),
  };

  if (eventType === 'click') {
    return {
      ...nextState,
      clickCount: state.clickCount + 1,
    };
  }

  if (eventType === 'selection') {
    return {
      ...nextState,
      dropdownSelections: {
        ...state.dropdownSelections,
        [target]: String(payload.value || ''),
      },
    };
  }

  if (eventType === 'slider') {
    const previous = state.sliderAdjustments[target] || { count: 0, value: 0 };
    return {
      ...nextState,
      sliderAdjustments: {
        ...state.sliderAdjustments,
        [target]: {
          value: numericValue(payload.value),
          count: previous.count + 1,
          updatedAt: timestamp,
        },
      },
    };
  }

  if (eventType === 'input') {
    return {
      ...nextState,
      inputSignals: {
        ...state.inputSignals,
        [target]: {
          length: String(payload.value || '').length,
          updatedAt: timestamp,
        },
      },
    };
  }

  return nextState;
};

export const InteractionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(interactionReducer, undefined, () => ({
    ...initialInteractionState,
    sessionStartedAt: Date.now(),
  }));
  const [sessionTick, setSessionTick] = useState(Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setSessionTick(Date.now()), 15000);
    return () => window.clearInterval(tick);
  }, []);

  const trackInteraction = useCallback((eventType, payload = {}) => {
    dispatch({ type: 'TRACK_INTERACTION', eventType, payload });
  }, []);

  const trackClick = useCallback(
    (target, metadata = {}) => trackInteraction('click', { ...metadata, target }),
    [trackInteraction],
  );

  const trackSelection = useCallback(
    (name, value, metadata = {}) => trackInteraction('selection', { ...metadata, name, value }),
    [trackInteraction],
  );

  const trackSlider = useCallback(
    (name, value, metadata = {}) => trackInteraction('slider', { ...metadata, name, value }),
    [trackInteraction],
  );

  const trackInput = useCallback(
    (name, value, metadata = {}) => trackInteraction('input', { ...metadata, name, value }),
    [trackInteraction],
  );

  const value = useMemo(() => ({
    state,
    sessionDurationMs: Math.max(0, sessionTick - state.sessionStartedAt),
    trackInteraction,
    trackClick,
    trackSelection,
    trackSlider,
    trackInput,
  }), [sessionTick, state, trackClick, trackInput, trackInteraction, trackSelection, trackSlider]);

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>;
};

export const useInteraction = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction must be used within an InteractionProvider');
  }
  return context;
};

export default InteractionContext;
