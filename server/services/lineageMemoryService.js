const Memory = require('../models/Memory');
const User = require('../models/User');

const cleanStringArray = (values = []) =>
  Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];

const extractLifeStageChoices = (profile = {}) => {
  const explicitChoices = cleanStringArray(profile.lifeStageChoices);
  if (explicitChoices.length) return explicitChoices;

  const singleLifeStage = String(profile.lifeStage || '').trim();
  return singleLifeStage ? [singleLifeStage] : [];
};

const extractSovereignContextFromUser = (user = {}) => {
  const profile = user?.onboarding?.profile || {};

  return {
    sovereignMatrixNote: String(profile.sovereignMatrixNote || '').trim(),
    onboardingReflection: String(profile.onboardingReflection || '').trim(),
    lifeStageChoices: extractLifeStageChoices(profile),
  };
};

const hasContextValue = (context = {}) =>
  Boolean(
    String(context.sovereignMatrixNote || '').trim() ||
      String(context.onboardingReflection || '').trim() ||
      cleanStringArray(context.lifeStageChoices).length
  );

const mergeSovereignContext = (memoryContext = {}, userContext = {}) => {
  const nextContext = {
    sovereignMatrixNote: memoryContext?.sovereignMatrixNote || userContext.sovereignMatrixNote || '',
    onboardingReflection: memoryContext?.onboardingReflection || userContext.onboardingReflection || '',
    lifeStageChoices: cleanStringArray(memoryContext?.lifeStageChoices).length
      ? cleanStringArray(memoryContext.lifeStageChoices)
      : cleanStringArray(userContext.lifeStageChoices),
  };

  if (hasContextValue(userContext)) {
    nextContext.sovereignMatrixNote = userContext.sovereignMatrixNote || nextContext.sovereignMatrixNote;
    nextContext.onboardingReflection = userContext.onboardingReflection || nextContext.onboardingReflection;
    nextContext.lifeStageChoices = cleanStringArray(userContext.lifeStageChoices).length
      ? cleanStringArray(userContext.lifeStageChoices)
      : nextContext.lifeStageChoices;
  }

  return nextContext;
};

const getOrCreateLineageMemory = async (userId) => {
  const user = await User.findById(userId).select('onboarding name username email role').lean();
  const userContext = extractSovereignContextFromUser(user);

  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({
      userId,
      sovereignContext: userContext,
      conversationHistory: [],
    });
    return { memory, user, sovereignContext: userContext };
  }

  const nextContext = mergeSovereignContext(memory.sovereignContext || {}, userContext);

  if (JSON.stringify(memory.sovereignContext || {}) !== JSON.stringify(nextContext)) {
    memory.sovereignContext = nextContext;
    await memory.save();
  }

  return { memory, user, sovereignContext: nextContext };
};

module.exports = {
  extractSovereignContextFromUser,
  getOrCreateLineageMemory,
};
