const mongoose = require('mongoose'),
  crypto = require('crypto'),
  core = require('./coreContextService'),
  cap = require('./reasoningCapabilityService');
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)).digest('hex');
async function assemble(request) {
  cap.requireRead();
  const read = async () => {
    const now = new Date(),
      life = await core.getContext();
    const manifest = {};
    const ref = (authority, doc, kind, extra = {}) => {
      const id = String(doc._id),
        key = authority + ':' + id;
      manifest[key] = {
        authority,
        id,
        revision: doc.revision || 0,
        kind,
        ...extra
      };
      return key;
    };
    const goals = (life.goals || []).filter(g => g.status === 'active' && g.confirmed !== false).map(g => ({
      ...pick(g, ['_id', 'description', 'domain', 'successMeasure', 'targetDate']),
      ref: g._id ? ref('Goal', g, 'goal', {
        contextRevision: life.revision
      }) : null
    }));
    const selectedGoalIds = request.selectedGoalIds.length ? request.selectedGoalIds : goals.length === 1 && goals[0]._id ? [String(goals[0]._id)] : [];
    if (selectedGoalIds.some(id => !goals.some(g => String(g._id) === id))) throw cap.error('NOT_FOUND', 'Selected goal is not available.', 404);
    const constraints = (life.constraints || []).map(c => ({
      ...pick(c, ['_id', 'description', 'hard', 'kind', 'validUntil']),
      ref: ref('Constraint', c, 'constraint')
    }));
    const resources = (life.resources || []).map(r => ({
      ...pick(r, ['_id', 'description', 'kind', 'validUntil']),
      ref: ref('Resource', r, 'resource')
    }));
    const coverage = {};
    async function rows(name, filter, sort, limit, fields, kind) {
      const Model = require('../models/' + name);
      let docs = [];
      // Only real canonical links affect relevance. Shared words are not goal linkage.
      if (name === 'Task' && selectedGoalIds.length) docs = await Model.find({
        ...filter,
        goalId: {
          $in: selectedGoalIds
        }
      }).sort(sort).limit(limit + 1).lean();
      const linked = docs.length;
      if (docs.length <= limit) docs.push(...(await Model.find({
        ...filter,
        ...(docs.length ? {
          _id: {
            $nin: docs.map(d => d._id)
          }
        } : {})
      }).sort(sort).limit(limit + 1 - docs.length).lean()));
      coverage[name] = {
        included: Math.min(docs.length, limit),
        truncated: docs.length > limit,
        explicitlyLinked: Math.min(linked, limit)
      };
      return docs.slice(0, limit).map(d => ({
        ...pick(d, fields),
        ref: ref(name, d, typeof kind === 'function' ? kind(d) : kind)
      }));
    }
    const facts = await rows('StrategicMemory', {}, {
        updatedAt: -1,
        _id: 1
      }, 50, ['_id', 'content', 'confirmed', 'source', 'category', 'revision', 'updatedAt', 'provenance', 'sourceId'], d => d.confirmed && d.category !== 'kernel' && d.provenance?.kind !== 'derived' && !(d.derivedFromPatternIds || []).length ? 'fact' : 'hypothesis'),
      observations = await rows('SignalEntry', {
        occurredAt: {
          $gte: new Date(+now - 28 * 86400000)
        }
      }, {
        occurredAt: -1,
        _id: 1
      }, 100, ['_id', 'domain', 'observationType', 'value', 'event', 'provenance', 'notes', 'occurredAt', 'revision', 'source', 'confirmed', 'sleep', 'stress', 'energy', 'mood', 'symptoms'], d => d.provenance?.kind === 'derived' ? 'derivative' : 'observation'),
      tasks = await rows('Task', {}, {
        updatedAt: -1,
        _id: 1
      }, 100, ['_id', 'description', 'status', 'goalId', 'intent', 'completedAt', 'revision', 'source'], 'task'),
      cycles = await rows('KernelCycle', {
        contextInvalidatedAt: null,
        createdAt: {
          $gte: new Date(+now - 28 * 86400000)
        }
      }, {
        createdAt: -1,
        _id: 1
      }, 20, ['_id', 'trigger', 'createdAt'], 'derived-operation'),
      actions = await rows('ActionExecution', {
        contextInvalidatedAt: null,
        createdAt: {
          $gte: new Date(+now - 28 * 86400000)
        }
      }, {
        createdAt: -1,
        _id: 1
      }, 50, ['_id', 'action_name', 'success', 'reasoning_cycle_id', 'createdAt'], 'operation-result'),
      memory = await require('../models/Memory').findOne().lean(),
      patternContext = await require('./patternPresentationService').getPatternContext({
        purpose: request.purpose === 'recommend' ? 'recommend' : ['planner', 'agent-plan'].includes(request.purpose) ? 'planner' : 'mentor'
      });
    const turns = (memory?.conversationHistory || []).slice(-40).map(t => ({
      ...pick(t, ['_id', 'role', 'text', 'timestamp']),
      ref: ref('ConversationTurn', t, t.role === 'user' ? 'user-statement' : 'derivative')
    }));
    for (const p of patternContext.patterns) manifest['Pattern:' + p.id] = {
      authority: 'Pattern',
      id: p.id,
      revision: p.revision,
      kind: 'supported-pattern'
    };
    const context = {
      version: 'reasoning-context-v1',
      policyVersion: 'reasoning-policy-v1',
      runtime: {
        m2: require('./patternCapabilityService').enabled(),
        executionAvailable: false
      },
      userContext: pick(life, ['authority', 'revision', 'preferredName', 'mentorStyle', 'narrative', 'values', 'obligations', 'relationships']),
      goals,
      selectedGoalIds,
      constraints,
      resources,
      observations,
      facts: facts.filter(x => manifest[x.ref].kind === 'fact'),
      hypotheses: facts.filter(x => manifest[x.ref].kind !== 'fact'),
      tasks,
      conversation: turns,
      outcomes: {
        cycles,
        actions,
        meaning: 'Operation success is not human outcome success; missing outcomes are unknown.'
      },
      patternContext,
      manifest,
      coverage
    };
    // Stable source digest excludes wall-clock and serialization-only writeSequence.
    for (const [name, items] of [['ConversationTurn', context.conversation], ['KernelCycle', context.outcomes.cycles], ['ActionExecution', context.outcomes.actions], ['Task', context.tasks], ['SignalEntry', context.observations], ['StrategicMemory', context.hypotheses], ['StrategicMemory', context.facts]]) {
      while (Buffer.byteLength(JSON.stringify(context)) > 65536 && items.length) {
        const removed = items.pop();
        delete manifest[removed.ref];
        coverage[name] = {
          ...coverage[name],
          included: Math.max(0, (coverage[name]?.included || 1) - 1),
          budgetOmitted: (coverage[name]?.budgetOmitted || 0) + 1,
          truncated: true
        };
      }
    }
    const serialized = JSON.stringify(context);
    if (Buffer.byteLength(serialized) > 65536) throw cap.error('CONTEXT_TOO_LARGE', 'Narrow the selected context before generating guidance.', 413);
    return {
      ...context,
      asOf: now.toISOString(),
      digest: hash(context)
    };
  };
  if (require('../utils/requestContext').getRequestContext().coreTransaction) return read();
  return mongoose.connection.transaction(read, {
    readConcern: {
      level: 'snapshot'
    }
  });
}
async function assertFresh(context, request) {
  await cap.recheck();
  const current = await assemble(request);
  if (current.digest !== context.digest) throw cap.error('CONTEXT_CHANGED', 'Context changed. Generate again.', 409);
  return current;
}
module.exports = {
  assemble,
  assertFresh,
  hash
};
