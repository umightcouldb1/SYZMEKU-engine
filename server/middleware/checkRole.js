const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { logAuditEvent } = require('../utils/audit');

const MASTER_ROLE = User.ROLES.COMMANDER_IN_CHIEF;

const stealthNotFound = (res) => res.status(404).json({ message: 'Not Found' });

const checkRole = (...allowedRoles) =>
  asyncHandler(async (req, res, next) => {
    const requiredRoles = allowedRoles.length ? allowedRoles : [MASTER_ROLE];
    const userRole = req.user?.role;

    if (!req.user || !requiredRoles.includes(userRole)) {
      await logAuditEvent({
        category: 'access',
        event: 'stealth_role_access_denied',
        req,
        userId: req.user?._id || null,
        role: userRole || '',
        success: false,
        details: { requiredRoles },
      }).catch(() => {});

      return stealthNotFound(res);
    }

    return next();
  });

const requireCommanderInChief = checkRole(MASTER_ROLE);

module.exports = {
  MASTER_ROLE,
  checkRole,
  requireCommanderInChief,
};
