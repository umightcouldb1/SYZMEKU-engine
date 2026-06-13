const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');

const ALLOWED_ACCENTS = new Set(['cyan', 'violet', 'gold', 'emerald', 'rose']);
const ALLOWED_INTERFACE_MODES = new Set(['crystalline', 'iridescent', 'minimal']);

const clampPercent = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

const sanitizePreferences = (preferences = {}, current = {}) => ({
  prismIntensity: clampPercent(preferences.prismIntensity, current.prismIntensity ?? 72),
  glassDensity: clampPercent(preferences.glassDensity, current.glassDensity ?? 58),
  motionEnabled: typeof preferences.motionEnabled === 'boolean'
    ? preferences.motionEnabled
    : current.motionEnabled ?? true,
  accent: ALLOWED_ACCENTS.has(preferences.accent) ? preferences.accent : current.accent || 'cyan',
  interfaceMode: ALLOWED_INTERFACE_MODES.has(preferences.interfaceMode)
    ? preferences.interfaceMode
    : current.interfaceMode || 'crystalline',
});

const getHighestTier = (purchasedProducts = []) => {
  const paidProducts = purchasedProducts.filter((product) => product.status === 'paid');
  if (paidProducts.some((product) => /genesis/i.test(product.name) || /genesis/i.test(product.tier))) {
    return 'genesis';
  }
  if (paidProducts.some((product) => /guardian/i.test(product.name) || /guardian/i.test(product.tier))) {
    return 'guardian';
  }
  if (paidProducts.some((product) => /cosmic/i.test(product.name) || /cosmic/i.test(product.tier))) {
    return 'cosmic';
  }
  if (paidProducts.some((product) => /harmonic/i.test(product.name) || /harmonic/i.test(product.tier))) {
    return 'harmonic';
  }
  if (paidProducts.length > 0) return 'active';
  return 'public';
};

const getOrCreateProfile = async (userId) => {
  let profile = await UserProfile.findOne({ userId });
  if (!profile) {
    profile = await UserProfile.create({ userId });
  }
  return profile;
};

const buildProfileResponse = (user, profile) => ({
  email: user.email,
  name: user.name,
  username: user.username,
  role: user.role,
  tier: profile.tier || 'public',
  history: profile.purchasedProducts || [],
  purchasedProducts: profile.purchasedProducts || [],
  prefs: profile.preferences,
  preferences: profile.preferences,
  updatedAt: profile.updatedAt,
});

const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const user = await User.findById(userId).select('-password');

  if (!user) {
    return res.status(404).json({ message: 'Profile not found.' });
  }

  const profile = await getOrCreateProfile(user._id);
  const tier = getHighestTier(profile.purchasedProducts);
  if (profile.tier !== tier) {
    profile.tier = tier;
    await profile.save();
  }

  return res.json(buildProfileResponse(user, profile));
});

const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const user = await User.findById(userId).select('-password');

  if (!user) {
    return res.status(404).json({ message: 'Profile not found.' });
  }

  const profile = await getOrCreateProfile(user._id);
  profile.preferences = sanitizePreferences(req.body?.preferences || {}, profile.preferences || {});
  await profile.save();

  return res.status(200).json({
    message: 'Preferences updated.',
    profile: buildProfileResponse(user, profile),
  });
});

module.exports = {
  getProfile,
  updateProfile,
};
