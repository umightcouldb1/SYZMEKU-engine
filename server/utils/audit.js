const AuditLog = require('../models/AuditLog');

const getRequestMeta = (req) => ({
  ip: req?.ip || req?.headers?.['x-forwarded-for'] || '',
  userAgent: req?.headers?.['user-agent'] || '',
});

const logAuditEvent = async ({ category, event, req, userId = null, role = '', success = true, details = {} }) => {
  try {
    await AuditLog.create({
      category,
      event,
      userId,
      role,
      success,
      details,
      ...getRequestMeta(req),
    });
  } catch (error) {
    console.warn('Audit log write failed:', error?.message || error);
  }
};

module.exports = { logAuditEvent };
