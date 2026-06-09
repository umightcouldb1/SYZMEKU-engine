import { useMemo } from 'react';
import { useInteraction } from '../context/InteractionContext.jsx';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const getDominantModule = (moduleEngagement) => {
  const entries = Object.entries(moduleEngagement || {});
  if (!entries.length) return 'global';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
};

const getAlignmentState = (score) => {
  if (score >= 78) return 'ALIGNED';
  if (score >= 52) return 'COHERING';
  if (score >= 26) return 'TUNING';
  return 'OBSERVING';
};

const suggestionMap = {
  OBSERVING: [
    'Choose a focus path to let Big SYZ shape the next guidance layer.',
    'Start with one signal, then adjust the depth threshold when you are ready.',
  ],
  TUNING: [
    'Your interaction pattern is forming. Keep narrowing the focus path.',
    'Adjust the threshold to shift from broad reflection into direct next steps.',
  ],
  COHERING: [
    'The interface is prioritizing the modules you are touching most often.',
    'Use the active controls to keep the current guidance lane in front.',
  ],
  ALIGNED: [
    'High alignment detected. The interface is ready for decisive sequence work.',
    'Your current module priority is stable enough for focused execution.',
  ],
};

const getLayoutPriority = (dominantModule, selections) => {
  const viewSelection = selections?.sovereignView || selections?.publicFocus || '';

  if (viewSelection.includes('timeline') || dominantModule.includes('timeline')) return 'TIMELINE_FIRST';
  if (viewSelection.includes('asset') || dominantModule.includes('asset')) return 'ASSET_FIRST';
  if (viewSelection.includes('guidance') || dominantModule.includes('public')) return 'GUIDANCE_FIRST';
  return 'BALANCED';
};

const getTextDensity = (score) => {
  if (score >= 70) return 'HIGH';
  if (score >= 38) return 'MEDIUM';
  return 'LOW';
};

const useEvolutionaryState = (options = {}) => {
  const scope = typeof options === 'string' ? options : options.scope || 'public';
  const interaction = useInteraction();
  const { state, sessionDurationMs } = interaction;

  const evolutionaryState = useMemo(() => {
    const selectionCount = Object.keys(state.dropdownSelections).length;
    const sliderValues = Object.values(state.sliderAdjustments).map((entry) => Number(entry.value) || 0);
    const sliderCount = sliderValues.length;
    const averageSlider = sliderCount
      ? sliderValues.reduce((total, value) => total + value, 0) / sliderCount
      : 0;
    const inputWeight = Object.values(state.inputSignals).reduce((total, signal) => {
      return total + clamp((signal.length || 0) / 8, 0, 8);
    }, 0);
    const durationMinutes = sessionDurationMs / 60000;
    const eventVelocity = durationMinutes > 0 ? state.eventLog.length / Math.max(durationMinutes, 0.25) : 0;

    const rawScore =
      state.clickCount * 2.4 +
      selectionCount * 8 +
      sliderCount * 7 +
      averageSlider * 0.28 +
      inputWeight +
      clamp(durationMinutes * 5, 0, 18) +
      clamp(eventVelocity * 1.8, 0, 16);

    const resonanceScore = Math.round(clamp(rawScore));
    const alignmentState = getAlignmentState(resonanceScore);
    const dominantModule = getDominantModule(state.moduleEngagement);
    const layoutPriority = getLayoutPriority(dominantModule, state.dropdownSelections);
    const promptSuggestions = suggestionMap[alignmentState];

    return {
      scope,
      resonanceScore,
      alignmentState,
      promptSuggestions,
      layoutPriority,
      textDensity: getTextDensity(resonanceScore),
      dominantModule,
      sessionDurationMs,
      clickFrequency: state.clickCount,
      activeSelections: state.dropdownSelections,
      activeSliders: state.sliderAdjustments,
      recentEvents: state.eventLog,
    };
  }, [scope, sessionDurationMs, state]);

  return {
    ...interaction,
    ...evolutionaryState,
  };
};

export default useEvolutionaryState;
