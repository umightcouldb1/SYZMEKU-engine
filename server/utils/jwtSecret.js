const getJwtSecret = () => {
  const configuredSecret = process.env.JWT_SECRET;

  if (!configuredSecret) {
    throw new Error('JWT secret is not configured. Set JWT_SECRET.');
  }

  return configuredSecret;
};

module.exports = { getJwtSecret };
