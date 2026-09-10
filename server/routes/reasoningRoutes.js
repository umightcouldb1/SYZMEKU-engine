const router = require('express').Router(),
  cap = require('../services/reasoningCapabilityService'),
  service = require('../services/reasoningService'),
  contracts = require('../contracts/reasoningContracts'),
  persistence = require('../services/reasoningPersistenceService');
router.use(require('../middleware/authMiddleware').protect);
const handle = fn => async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    res.json(await fn(req, controller.signal));
  } catch (err) {
    const r = service.failure(err);
    if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
    res.status(r.status).json(r.body);
  }
};
const maybe = (req, res, next) => {
  try {
    if (cap.enabled()) next();else next('route');
  } catch (e) {
    const r = service.failure(e);
    res.status(r.status).json(r.body);
  }
};
function input(req) {
  require('../services/coreScopeService').rejectOwnerFields(req.body);
  return {
    text: req.body.text,
    selectedGoalIds: req.body.selectedGoalIds
  };
}
router.get('/reasoning/capability', handle(async () => ({
  enabled: cap.enabled()
})));
router.get('/reasoning/evidence', handle(async req => {
  const context = require('../services/reasoningContextService');
  const request = {
    purpose: 'mentor',
    selectedGoalIds: [],
    text: ''
  };
  const snapshot = await context.assemble(request),
    ref = req.query.ref;
  if (typeof ref !== 'string' || !Object.hasOwn(snapshot.manifest, ref)) throw cap.error('NOT_FOUND', 'Evidence is not available in current scoped context.', 404);
  const entries = [...snapshot.goals, ...snapshot.constraints, ...snapshot.resources, ...snapshot.facts, ...snapshot.hypotheses, ...snapshot.observations, ...snapshot.tasks, ...snapshot.conversation, ...snapshot.outcomes.cycles, ...snapshot.outcomes.actions, ...snapshot.patternContext.patterns.map(p => ({
    ...p,
    ref: 'Pattern:' + p.id
  }))];
  const entry = entries.find(e => e.ref === ref);
  await context.assertFresh(snapshot, request);
  return {
    reference: snapshot.manifest[ref],
    entry
  };
}));
for (const purpose of ['mentor', 'recommend', 'analyze']) router.post('/' + purpose, maybe, handle(async (req, signal) => service.compatibility(await service.generate(input(req), {
  purpose,
  conversation: purpose === 'analyze',
  signal
}))));
router.post('/agent/plan', handle(async (req, signal) => service.compatibility(await service.generate(req.body, {
  purpose: 'agent-plan',
  signal
}))));
router.post('/reasoning/nodes/:node', handle(async (req, signal) => {
  const {
    purpose,
    body
  } = require('../logic/reasoningSpecialists').request(req.params.node, req.body);
  return service.generate(body, {
    purpose,
    signal
  });
}));
router.post('/reasoning/preview', handle(async (req, signal) => {
  contracts.exact(req.body, ['purpose', 'text', 'selectedGoalIds']);
  const {
    purpose,
    ...body
  } = req.body;
  return service.generate(body, {
    purpose,
    signal
  });
}));
router.post('/reasoning/records', handle(async (req, signal) => {
  contracts.exact(req.body, ['purpose', 'text', 'selectedGoalIds', 'requestKey']);
  const {
    purpose,
    ...body
  } = req.body;
  return service.generate(body, {
    purpose,
    save: true,
    signal
  });
}));
router.get('/reasoning/records', handle(() => persistence.list()));
router.get('/reasoning/records/:id', handle(req => persistence.detail(req.params.id)));
router.patch('/reasoning/records/:id', handle(req => persistence.change(req.params.id, req.body)));
router.delete('/reasoning/records/:id', handle(req => persistence.remove(req.params.id)));
module.exports = router;
