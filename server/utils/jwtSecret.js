const getJwtSecret = () => {
  const configuredSecret = process.env.JWT_SECRET
    || process.env.JWT_Secret
    || [process.env.ENGINE_SIGNATURE, process.env.SYSTEM_VECTOR].filter(Boolean).join(':');

  if (!configuredSecret) {
    throw new Error('JWT secret is not configured. Set JWT_SECRET, JWT_Secret, or ENGINE_SIGNATURE/SYSTEM_VECTOR.');
  }

  return configuredSecret;
};

module.exports = { getJwtSecret };
