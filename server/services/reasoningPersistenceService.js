const Record = require('../models/ReasoningRecord'),
  cap = require('./reasoningCapabilityService'),
  context = require('./reasoningContextService');
const INDEXES = [{
  name: 'reasoning_owner_request_uq',
  key: {
    userId: 1,
    requestKey: 1
  },
  unique: true
}, {
  name: 'reasoning_owner_updated',
  key: {
    userId: 1,
    updatedAt: -1,
    _id: 1
  }
}];
async function prerequisites() {
  const indexes = await Record.collection.indexes().catch(() => []);
  if (!INDEXES.every(s => indexes.some(i => i.name === s.name && JSON.stringify(i.key) === JSON.stringify(s.key) && !!i.unique === !!s.unique))) throw cap.error('REASONING_INDEXES_REQUIRED', 'Saved reasoning indexes must be provisioned before saving.', 503);
}
const requestHash = r => context.hash({
  purpose: r.purpose,
  text: r.text,
  selectedGoalIds: r.selectedGoalIds,
  media: r.media ? {
    mimeType: r.media.mimeType,
    digest: context.hash(r.media.data)
  } : null
});
async function replay(request, snapshot) {
  const prior = await Record.findOne({
    requestKey: request.requestKey
  }).lean();
  if (!prior) return null;
  if (prior.requestHash !== requestHash(request)) throw cap.error('REVISION_CONFLICT', 'Request key cannot be reused with different or erased content.', 409);
  if (prior.freshness !== 'current' || prior.validationDigest !== snapshot.digest) throw cap.error('CONTEXT_CHANGED', 'Saved result is stale. Use a new request key to regenerate.', 409);
  return {
    ...prior.payload,
    patternContext: snapshot.patternContext,
    persistence: {
      saved: true,
      recordId: String(prior._id),
      revision: prior.revision
    }
  };
}
async function save(request, snapshot, result, provider) {
  await cap.recheck({
    write: true
  });
  await prerequisites();
  return require('./coreContextService').withContextMutation(async () => {
    await context.assertFresh(snapshot, request);
    const old = await replay(request, snapshot);
    if (old) return old;
    const r = await Record.create({
      purpose: request.purpose,
      requestKey: request.requestKey,
      requestHash: requestHash(request),
      requestSummary: request.text.slice(0, 1000),
      selectedGoalIds: snapshot.selectedGoalIds,
      inputDigest: snapshot.digest,
      validationDigest: snapshot.digest,
      sourceManifest: snapshot.manifest,
      payload: {
        ...result,
        patternContext: {
          sourceEpoch: snapshot.patternContext.sourceEpoch,
          patterns: snapshot.patternContext.patterns.map(p => ({
            id: p.id,
            revision: p.revision
          })),
          unavailableReasons: snapshot.patternContext.unavailableReasons
        }
      },
      provider: provider.provider,
      model: provider.model
    });
    return {
      ...result,
      persistence: {
        saved: true,
        recordId: String(r._id),
        revision: r.revision
      }
    };
  }, {
    evidence: false
  });
}
function shell(r) {
  return {
    id: String(r._id),
    revision: r.revision,
    status: r.status,
    freshness: r.freshness,
    purpose: r.purpose,
    message: 'Saved guidance changed or expired. Generate again.'
  };
}
async function view(r) {
  if (!r) return null;
  const stub = shell(r);
  if (r.freshness !== 'current') return stub;
  const current = await context.assemble({
    purpose: r.purpose,
    selectedGoalIds: r.selectedGoalIds.map(String),
    text: ''
  }).catch(e => {
    if (e.statusCode === 404) return null;
    throw e;
  });
  if (!current || current.digest !== r.validationDigest) return {
    ...stub,
    freshness: 'stale'
  };
  await context.assertFresh(current, {
    purpose: r.purpose,
    selectedGoalIds: r.selectedGoalIds.map(String),
    text: ''
  });
  const latest = await Record.findById(r._id).select('revision freshness').lean();
  if (!latest || latest.revision !== r.revision || latest.freshness !== 'current') throw cap.error('CONTEXT_CHANGED', 'Saved guidance changed. Reload.', 409);
  await cap.recheck();
  return {
    ...stub,
    payload: {
      ...r.payload,
      patternContext: current.patternContext,
      persistence: {
        saved: true,
        recordId: String(r._id),
        revision: r.revision
      }
    },
    message: undefined
  };
}
async function list() {
  await cap.recheck();
  const rows = await Record.find().sort({
    updatedAt: -1,
    _id: 1
  }).limit(25).lean();
  const records = await Promise.all(rows.map(view));
  // A correction while another item was hydrating must suppress the whole batch.
  const latest = await Record.find({
    _id: {
      $in: rows.map(r => r._id)
    }
  }).select('revision freshness').lean();
  for (const record of records.filter(r => r.payload)) {
    const current = latest.find(r => String(r._id) === record.id);
    if (!current || current.revision !== record.revision || current.freshness !== 'current') throw cap.error('CONTEXT_CHANGED', 'Saved guidance changed. Reload.', 409);
  }
  await cap.recheck();
  return {
    records
  };
}
async function detail(id) {
  await cap.recheck();
  if (!/^[a-f\d]{24}$/i.test(id)) throw cap.error('NOT_FOUND', 'Saved reasoning not found.', 404);
  const r = await Record.findById(id).lean();
  if (!r) throw cap.error('NOT_FOUND', 'Saved reasoning not found.', 404);
  return view(r);
}
async function change(id, body) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw cap.error('NOT_FOUND', 'Saved reasoning not found.', 404);
  await cap.recheck({
    write: true
  });
  require('../contracts/reasoningContracts').exact(body, ['expectedRevision', 'status', 'plan']);
  return require('./coreContextService').withContextMutation(async () => {
    const r = await Record.findById(id);
    if (!r) throw cap.error('NOT_FOUND', 'Saved reasoning not found.', 404);
    if (r.revision !== body.expectedRevision) throw cap.error('REVISION_CONFLICT', 'Saved reasoning changed.', 409);
    if (body.status !== undefined && !['draft', 'archived'].includes(body.status)) throw cap.error('INVALID_REQUEST', 'Invalid draft status.');
    if (body.plan !== undefined) {
      if (!['planner', 'agent-plan'].includes(r.purpose)) throw cap.error('INVALID_REQUEST', 'Only saved plans support plan editing.');
      const snapshot = await context.assemble({
        purpose: r.purpose,
        selectedGoalIds: r.selectedGoalIds.map(String),
        text: ''
      });
      if (r.freshness !== 'current' || r.validationDigest !== snapshot.digest) throw cap.error('CONTEXT_CHANGED', 'Regenerate stale guidance before editing.', 409);
      const plan = require('../contracts/reasoningContracts').plan(body.plan, snapshot);
      r.payload = {
        ...r.payload,
        plan: {
          ...plan,
          authorship: 'user-edited',
          feasibility: 'needs_clarification'
        },
        status: 'needs_clarification'
      };
    }
    if (body.status) r.status = body.status;
    r.revision++;
    await r.save();
    return shell(r);
  }, {
    evidence: false
  });
}
async function remove(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw cap.error('NOT_FOUND', 'Saved reasoning not found.', 404);
  await cap.recheck({
    write: true
  });
  return require('./coreContextService').withContextMutation(async () => {
    await Record.deleteOne({
      _id: id
    });
    return {
      deleted: true
    };
  }, {
    evidence: false
  });
}
module.exports = {
  INDEXES,
  prerequisites,
  replay,
  save,
  list,
  detail,
  change,
  remove
};
