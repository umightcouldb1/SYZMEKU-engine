const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.error_description || payload.message || `Provider request failed with ${response.status}.`);
    error.statusCode = response.status;
    error.providerPayload = payload;
    throw error;
  }

  return payload;
};

module.exports = { requestJson };
