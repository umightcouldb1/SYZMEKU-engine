export const CANONICAL_GOOGLE_CLIENT_ID = '994975817231-obs40351opa36ljffmelqb4o3vtru044.apps.googleusercontent.com';

const isGoogleClientId = (clientId = '') =>
  /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId);

export const getGoogleClientId = () => {
  const configuredClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  if (!configuredClientId) return CANONICAL_GOOGLE_CLIENT_ID;
  if (!isGoogleClientId(configuredClientId)) return CANONICAL_GOOGLE_CLIENT_ID;
  if (configuredClientId !== CANONICAL_GOOGLE_CLIENT_ID) return CANONICAL_GOOGLE_CLIENT_ID;

  return configuredClientId;
};
