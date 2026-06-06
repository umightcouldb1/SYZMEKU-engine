const Memory = require('../models/Memory');
const User = require('../models/User');

const extractSovereignContextFromUser = (user = {}) => {
  const profile = user?.onboarding?.profile || {};

  return {
    sovereignMatrixNote: String(profile.sovereignMatrixNote || '').trim(),
    onboardingReflection: String(profile.onboardingReflection || '').trim(),
  };
};

const hasContextValue = (context = {}) =>
  Boolean(String(context.sovereignMatrixNote || '').trim() || String(context.onboardingReflection || '').trim());

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

  const nextContext = {
    sovereignMatrixNote: memory.sovereignContext?.sovereignMatrixNote || userContext.sovereignMatrixNote,
    onboardingReflection: memory.sovereignContext?.onboardingReflection || userContext.onboardingReflection,
  };

  if (hasContextValue(userContext)) {
    nextContext.sovereignMatrixNote = userContext.sovereignMatrixNote || nextContext.sovereignMatrixNote;
    nextContext.onboardingReflection = userContext.onboardingReflection || nextContext.onboardingReflection;
  }

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
