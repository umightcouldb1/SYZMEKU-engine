const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildYouTubeUploadRequest,
  normalizeYouTubeError,
} = require('../social/providers/youtubeProvider');

test('buildYouTubeUploadRequest sanitizes YouTube metadata before upload', () => {
  const requestBody = buildYouTubeUploadRequest({
    title: `${'A'.repeat(150)}\nextra`,
    description: 'Launch copy\u0000with control chars',
    link: 'https://freedom.toisouljahacademy.com?utm_source=youtube',
    hashtags: ['#FreedomAudit', '#FreedomAudit', '  #BigSYZ  ', '', '#'.repeat(40)],
    metadata: {
      categoryId: 'not-a-category',
      privacyStatus: 'not-public',
    },
  });

  assert.equal(requestBody.snippet.title.length, 99);
  assert.equal(requestBody.snippet.description.includes('\u0000'), false);
  assert.equal(requestBody.snippet.description.includes('https://freedom.toisouljahacademy.com'), true);
  assert.deepEqual(requestBody.snippet.tags, ['FreedomAudit', 'BigSYZ']);
  assert.equal(requestBody.snippet.categoryId, '27');
  assert.equal(requestBody.status.privacyStatus, 'public');
  assert.equal(requestBody.status.selfDeclaredMadeForKids, false);
});

test('normalizeYouTubeError preserves provider rejection reason', () => {
  const error = new Error('Bad Request');
  error.response = {
    status: 400,
    data: {
      error: {
        code: 400,
        message: 'The request metadata specifies an invalid video title.',
        status: 'INVALID_ARGUMENT',
        errors: [
          {
            reason: 'invalidTitle',
            message: 'The request metadata specifies an invalid video title.',
          },
        ],
      },
    },
  };

  const normalized = normalizeYouTubeError(error);

  assert.equal(normalized.statusCode, 400);
  assert.equal(normalized.code, 'invalidTitle');
  assert.equal(normalized.providerReason, 'invalidTitle');
  assert.match(normalized.message, /invalidTitle/);
  assert.equal(normalized.providerPayload.status, 'INVALID_ARGUMENT');
});
