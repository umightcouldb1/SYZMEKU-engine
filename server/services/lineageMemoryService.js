const core = require('./coreContextService');
const { requireCoreScope } = require('./coreScopeService');
const extractSovereignContextFromUser = (user = {}) => {
  const profile = user.onboarding?.profile || {};
  return { sovereignMatrixNote: profile.sovereignMatrixNote || '', onboardingReflection: profile.onboardingReflection || '', lifeStageChoices: profile.lifeStage ? [profile.lifeStage] : [] };
};
const getOrCreateLineageMemory = async userId => { requireCoreScope(userId); return core.getConversation(); };
module.exports = { getOrCreateLineageMemory, extractSovereignContextFromUser };
