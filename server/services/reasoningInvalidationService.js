const Record = require('../models/ReasoningRecord');
async function stale() {
  await Record.updateMany({
    freshness: 'current'
  }, {
    $set: {
      freshness: 'stale'
    },
    $inc: {
      revision: 1
    }
  });
}
async function redact(reasonCode = 'context_revised') {
  await Record.updateMany({}, {
    $set: {
      freshness: 'redacted',
      payload: null,
      sourceManifest: null,
      requestSummary: '',
      selectedGoalIds: [],
      inputDigest: '',
      validationDigest: '',
      requestHash: 'redacted',
      invalidation: {
        at: new Date(),
        reasonCode
      }
    },
    $inc: {
      revision: 1
    }
  });
}
async function erase() {
  await Record.deleteMany({});
}
module.exports = {
  stale,
  redact,
  erase
};
