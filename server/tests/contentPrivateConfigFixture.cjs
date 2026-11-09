'use strict';

// Deliberately synthetic. Tests replace, never inherit, operator configuration.
const BUSINESS_ACCOUNT = 'workspace-owner@example.test';
const ORIGINAL_LOGO_FILE_ID = 'synthetic_original_logo_12345';
function configure() {
  process.env.CONTENT_FACTORY_WORKSPACE_EMAIL = BUSINESS_ACCOUNT;
  process.env.CONTENT_FACTORY_ORIGINAL_LOGO_FILE_ID = ORIGINAL_LOGO_FILE_ID;
}
module.exports = { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID, configure };
