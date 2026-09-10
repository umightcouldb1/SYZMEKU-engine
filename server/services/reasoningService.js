const crypto = require('crypto'),
  contracts = require('../contracts/reasoningContracts'),
  context = require('./reasoningContextService'),
  cap = require('./reasoningCapabilityService'),
  policy = require('../logic/reasoningPolicy');
async function generate(body, {
  purpose = 'mentor',
  save = false,
  conversation = false,
  provider = 'gemini',
  signal
} = {}) {
  const request = contracts.request(body, purpose),
    requestId = crypto.randomUUID();
  // No HTTP surface requests both. Reject an unsafe future internal caller rather
  // than committing two independently authorized artifacts in separate transactions.
  if (save && conversation) throw cap.error('INVALID_REQUEST', 'Choose conversation or explicit saved guidance for this request.');
  await cap.recheck({
    write: save || conversation
  });
  if (save && !request.requestKey) throw cap.error('INVALID_REQUEST', 'An idempotency request key is required to save.');
  const persistence = require('./reasoningPersistenceService');
  if (save) await persistence.prerequisites();
  const snapshot = await context.assemble(request);
  if (save) {
    const prior = await persistence.replay(request, snapshot);
    if (prior) {
      await context.assertFresh(snapshot, request);
      return {
        ...prior,
        requestId
      };
    }
  }
  const question = policy.clarification(snapshot);
  if (question) {
    await context.assertFresh(snapshot, request);
    return {
      ...policy.present({
        recommendations: [],
        plan: null,
        questions: [question],
        constraintConflicts: []
      }, snapshot, request),
      requestId,
      status: 'needs_clarification',
      summary: question
    };
  }
  const deadline = AbortSignal.timeout(60000),
    combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let output, model;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (combined.aborted) throw cap.error('MODEL_TIMEOUT', 'Model request timed out.', 504);
    try {
      model = await require('./modelRouter').generateStructured({
        purpose,
        prompt: policy.prompt(snapshot, request) + (attempt ? '\nThe previous response did not match the schema. Return only the exact required fields and valid references.' : ''),
        media: request.media,
        provider,
        signal: combined
      });
    } catch (error) {
      await context.assertFresh(snapshot, request);
      throw error;
    }
    await context.assertFresh(snapshot, request);
    try {
      if (typeof model.text !== 'string' || model.text.length > 65536) contracts.fail('Invalid response size.');
      output = contracts.output(JSON.parse(model.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), snapshot);
      if (['planner', 'agent-plan'].includes(purpose) && !output.plan) contracts.fail('A planner response needs a plan.');
      if (!['planner', 'agent-plan'].includes(purpose) && output.plan) contracts.fail('This purpose does not generate a plan.');
      break;
    } catch (e) {
      if (attempt === 1) throw cap.error('MODEL_OUTPUT_INVALID', 'The model could not produce valid evidence-linked guidance.', 502);
    }
  }
  let result = {
    ...policy.present(output, snapshot, request),
    requestId
  };
  await context.assertFresh(snapshot, request);
  if (combined.aborted) throw cap.error('MODEL_TIMEOUT', 'Model request timed out.', 504);
  if (save) result = await persistence.save(request, snapshot, result, model);
  if (conversation) {
    let committed;
    const core = require('./coreContextService');
    await core.withContextMutation(async () => {
      await cap.recheck({
        write: true
      });
      await context.assertFresh(snapshot, request);
      const state = await core.getConversation();
      await core.appendConversation([{
        role: 'user',
        text: request.text,
        timestamp: new Date()
      }, {
        role: 'model',
        text: result.summary,
        timestamp: new Date(),
        reasoningRefs: Object.keys(snapshot.manifest).slice(0, 100),
        patternRefs: result.patternContext.patterns.map(p => ({
          patternId: p.id,
          revision: p.revision,
          sourceEpoch: result.patternContext.sourceEpoch
        }))
      }], {
        contextRevision: state.context.revision || 0,
        conversationRevision: state.memory.revision || 0,
        patternStamp: result.patternContext
      });
      committed = await context.assemble(request);
    }, {
      evidence: false
    });
    await context.assertFresh(committed, request);
    result.context = {
      ...result.context,
      validationDigest: committed.digest
    };
  } else await context.assertFresh(snapshot, request);
  return result;
}
async function preview() {
  await cap.recheck();
  const snapshot = await context.assemble({
    purpose: 'planner',
    selectedGoalIds: [],
    text: ''
  });
  await context.assertFresh(snapshot, {
    purpose: 'planner',
    selectedGoalIds: [],
    text: ''
  });
  return {
    patternContext: snapshot.patternContext,
    goals: snapshot.goals,
    suggestions: [],
    execution: 'disabled',
    message: 'Generate a plan explicitly to review goal-linked steps. No tasks or actions were created.'
  };
}
function compatibility(result) {
  return {
    ...result,
    text: result.summary,
    summary: result.summary,
    reasoning_summary: result.summary,
    objectives: [result.summary],
    constraints: result.constraintConflicts.map(c => c.description),
    risks: result.limitations,
    leverage: result.rationale.flatMap(x => x.reasons),
    next_actions: result.recommendations.filter(r => r.feasibility !== 'needs_clarification').slice(0, 3).map(r => r.description)
  };
}
function failure(err, requestId = crypto.randomUUID()) {
  const known = err.reasoningError || err.code === 'CORE_SCOPE_REQUIRED';
  return {
    status: known ? err.statusCode || 503 : 500,
    body: {
      ok: false,
      requestId,
      error: {
        code: known ? err.code : 'REASONING_FAILED',
        message: known ? err.message : 'Reasoning could not be completed.',
        retryable: [429, 502, 503, 504].includes(err.statusCode),
        ...(err.retryAfterSeconds ? {
          retryAfterSeconds: err.retryAfterSeconds
        } : {})
      }
    }
  };
}
module.exports = {
  generate,
  preview,
  compatibility,
  failure
};
