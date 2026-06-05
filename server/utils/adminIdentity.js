const bcrypt = require('bcryptjs');
const User = require('../models/User');

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const getAdminEmail = () => normalizeEmail(process.env.ADMIN_EMAIL);

const isAdminEmail = (email = '') => {
  const adminEmail = getAdminEmail();
  return Boolean(adminEmail && normalizeEmail(email) === adminEmail);
};

const getInitialAdminPassword = () => String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();

const ensureAdminRoleForUser = async (user) => {
  if (!user || !isAdminEmail(user.email)) return user;
  if (user.role === 'admin') return user;

  user.role = 'admin';
  await user.save();
  return user;
};

const initializeAdminSystem = async () => {
  const adminEmail = getAdminEmail();
  const initialPassword = getInitialAdminPassword();

  if (!adminEmail) {
    console.warn('[SYS-INIT] ADMIN_EMAIL not configured; admin auto-initialization skipped.');
    return;
  }

  try {
    let admin = await User.findOne({ email: adminEmail });

    if (!admin) {
      if (!initialPassword) {
        console.warn('[SYS-INIT] Admin identity missing, but INITIAL_ADMIN_PASSWORD is not configured.');
        return;
      }

      console.log('[SYS-INIT] Admin identity not found. Provisioning system commander.');
      const hashedPassword = await bcrypt.hash(initialPassword, 10);

      admin = await User.create({
        name: process.env.ADMIN_NAME || 'System Commander',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
      });

      console.log('[SYS-INIT] Master Admin account securely deployed.');
      return;
    }

    let changed = false;

    if (admin.role !== 'admin') {
      admin.role = 'admin';
      changed = true;
    }

    if (process.env.RESET_ADMIN_PASSWORD === 'true') {
      if (!initialPassword) {
        console.warn('[SYS-INIT] RESET_ADMIN_PASSWORD is true, but INITIAL_ADMIN_PASSWORD is not configured.');
      } else {
        console.log('[SYS-INIT] Password reset flag detected. Updating admin credentials.');
        admin.password = await bcrypt.hash(initialPassword, 10);
        changed = true;
      }
    }

    if (changed) {
      await admin.save();
      console.log('[SYS-INIT] Admin identity updated. Clear RESET_ADMIN_PASSWORD after successful login.');
    } else {
      console.log('[SYS-INIT] Admin identity verified. Integrity: Secure.');
    }
  } catch (error) {
    console.error('[SYS-INIT] Error initializing admin system:', error?.message || error);
  }
};

module.exports = {
  ensureAdminRoleForUser,
  initializeAdminSystem,
  isAdminEmail,
  normalizeEmail,
};
