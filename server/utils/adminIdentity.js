const bcrypt = require('bcryptjs');
const User = require('../models/User');

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const deriveUsernameFromEmail = (email = '') => {
  const normalizedEmail = normalizeEmail(email);
  const localPart = normalizedEmail.split('@')[0] || 'user';
  return localPart.replace(/[^a-z0-9._-]/g, '').slice(0, 48) || 'user';
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const emailQuery = (email) => ({
  email: { $regex: `^${escapeRegExp(normalizeEmail(email))}$`, $options: 'i' },
});

const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return User.findOne(emailQuery(normalizedEmail));
};

const resolveUniqueUsername = async (preferredUsername, currentUserId = null) => {
  const base = String(preferredUsername || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 48) || 'user';

  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = await User.findOne({ username: candidate }).select('_id');
    if (!existing || (currentUserId && String(existing._id) === String(currentUserId))) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base.slice(0, Math.max(1, 48 - String(suffix).length - 1))}-${suffix}`;
  }
};

const getAdminEmail = () => normalizeEmail(process.env.ADMIN_EMAIL || 'umightcouldb1@toisouljahacademy.com');

const findAdminByEmail = (email) => findUserByEmail(email);

const isAdminEmail = (email = '') => {
  const adminEmail = getAdminEmail();
  return Boolean(adminEmail && normalizeEmail(email) === adminEmail);
};

const getInitialAdminPassword = () => String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();

const ensureAdminRoleForUser = async (user) => {
  if (!user || !isAdminEmail(user.email)) return user;

  let changed = false;
  const normalizedEmail = normalizeEmail(user.email);
  const derivedUsername = process.env.ADMIN_USERNAME || deriveUsernameFromEmail(normalizedEmail);

  if (user.email !== normalizedEmail) {
    user.email = normalizedEmail;
    changed = true;
  }

  if (!user.username) {
    user.username = await resolveUniqueUsername(derivedUsername, user._id);
    changed = true;
  }

  if (user.role !== 'admin') {
    user.role = 'admin';
    changed = true;
  }

  if (changed) await user.save();
  return user;
};

const createFreshAdmin = async (adminEmail, initialPassword) => {
  const hashedPassword = await bcrypt.hash(initialPassword, 10);
  const username = await resolveUniqueUsername(process.env.ADMIN_USERNAME || deriveUsernameFromEmail(adminEmail));

  return User.create({
    name: process.env.ADMIN_NAME || 'System Commander',
    username,
    email: adminEmail,
    password: hashedPassword,
    role: 'admin',
    isVerified: true,
  });
};

const initializeAdminSystem = async () => {
  const adminEmail = getAdminEmail();
  const initialPassword = getInitialAdminPassword();

  if (!adminEmail) {
    console.warn('[SYS-INIT] ADMIN_EMAIL not configured; admin auto-initialization skipped.');
    return;
  }

  try {
    if (process.env.RESET_ADMIN_PASSWORD === 'true') {
      if (!initialPassword) {
        console.warn('[SYS-INIT] RESET_ADMIN_PASSWORD is true, but INITIAL_ADMIN_PASSWORD is not configured.');
        return;
      }

      console.log(`[SYS-INIT] Initiating master clearance for: ${adminEmail}`);
      const deleteResult = await User.deleteMany(emailQuery(adminEmail));
      if (deleteResult.deletedCount > 0) {
        console.log(`[SYS-INIT] Cleared ${deleteResult.deletedCount} old/stuck admin records from database.`);
      }

      const admin = await createFreshAdmin(adminEmail, initialPassword);
      console.log(`[SYS-INIT] SUCCESS: Master Admin account freshly deployed and synchronized with username: ${admin.username}.`);
      return;
    }

    let admin = await findAdminByEmail(adminEmail);

    if (!admin) {
      if (!initialPassword) {
        console.warn('[SYS-INIT] Admin identity missing, but INITIAL_ADMIN_PASSWORD is not configured.');
        return;
      }

      console.log('[SYS-INIT] Admin identity not found. Provisioning system commander.');
      admin = await createFreshAdmin(adminEmail, initialPassword);
      console.log(`[SYS-INIT] Master Admin account securely deployed with username: ${admin.username}.`);
      return;
    }

    let changed = false;
    const derivedUsername = process.env.ADMIN_USERNAME || deriveUsernameFromEmail(adminEmail);

    if (admin.email !== adminEmail) {
      admin.email = adminEmail;
      changed = true;
    }

    if (!admin.username) {
      admin.username = await resolveUniqueUsername(derivedUsername, admin._id);
      changed = true;
    }

    if (admin.role !== 'admin') {
      admin.role = 'admin';
      changed = true;
    }

    if (changed) {
      await admin.save();
      console.log('[SYS-INIT] Admin identity updated.');
    } else {
      console.log('[SYS-INIT] Admin identity verified. Integrity: Secure.');
    }
  } catch (error) {
    console.error('[SYS-INIT] CRITICAL CRASH during admin initialization:', error?.message || error);
  }
};

module.exports = {
  deriveUsernameFromEmail,
  ensureAdminRoleForUser,
  findAdminByEmail,
  findUserByEmail,
  initializeAdminSystem,
  isAdminEmail,
  normalizeEmail,
  resolveUniqueUsername,
};
