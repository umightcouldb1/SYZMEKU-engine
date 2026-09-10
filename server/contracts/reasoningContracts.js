const {
  error
} = require('../services/reasoningCapabilityService');
const PURPOSES = ['mentor', 'recommend', 'planner', 'agent-plan', 'analyze', 'vision', 'reflection'];
const fail = message => {
  throw error('MODEL_OUTPUT_INVALID', message, 502);
};
function exact(value, keys, model = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) {
    if (model) fail('Unexpected response fields.');
    throw error('INVALID_REQUEST', 'Unexpected request fields.');
  }
}
function string(value, max = 2000, model = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    if (model) fail('Invalid response text.');
    throw error('INVALID_REQUEST', 'Invalid text.');
  }
  return value.trim();
}
function array(value, max = 50, model = false) {
  if (!Array.isArray(value) || value.length > max) {
    if (model) fail('Invalid response list.');
    throw error('INVALID_REQUEST', 'Invalid list.');
  }
  return value;
}
function request(body, purpose = 'mentor') {
  exact(body, ['text', 'selectedGoalIds', 'requestKey', 'media']);
  if (!PURPOSES.includes(purpose)) throw error('INVALID_REQUEST', 'Unknown purpose.');
  const text = string(body.text, 8000),
    selectedGoalIds = array(body.selectedGoalIds || [], 50).map(id => {
      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw error('INVALID_REQUEST', 'Invalid goal reference.');
      return id.toLowerCase();
    });
  if (new Set(selectedGoalIds).size !== selectedGoalIds.length) throw error('INVALID_REQUEST', 'Duplicate goal selection.');
  if (body.requestKey && (typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestKey))) throw error('INVALID_REQUEST', 'Invalid request key.');
  let media;
  if (body.media) {
    exact(body.media, ['mimeType', 'data', 'name']);
    if (purpose !== 'vision' || !/^image\/(png|jpeg|webp|gif)$|^video\/(mp4|webm)$/.test(body.media.mimeType) || typeof body.media.data !== 'string' || body.media.data.length > 1000000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(body.media.data)) throw error('INVALID_REQUEST', 'Invalid or oversized attachment.');
    media = {
      mimeType: body.media.mimeType,
      data: body.media.data,
      name: string(body.media.name || 'attachment', 120)
    };
  }
  return {
    purpose,
    text,
    selectedGoalIds,
    requestKey: body.requestKey,
    media
  };
}
function references(values, context) {
  return array(values, 20, true).map(key => {
    if (typeof key !== 'string' || !Object.hasOwn(context.manifest, key)) fail('Unknown evidence reference.');
    return key;
  });
}
function goals(values, context) {
  const ids = array(values, 50, true);
  if (!ids.length || ids.some(id => !context.selectedGoalIds.includes(id)) || new Set(ids).size !== ids.length) fail('Recommendation must reference selected owned goals.');
  return ids;
}
function effort(value) {
  exact(value, ['band', 'durationRangeMinutes', 'basis'], true);
  if (!['low', 'medium', 'high', 'unknown'].includes(value.band)) fail('Invalid effort band.');
  const out = {
    band: value.band,
    basis: string(value.basis, 500, true)
  };
  if (value.durationRangeMinutes !== undefined) {
    const r = array(value.durationRangeMinutes, 2, true);
    if (r.length !== 2 || r.some(x => !Number.isFinite(x) || x < 0 || x > 525600) || r[0] > r[1]) fail('Invalid effort range.');
    out.durationRangeMinutes = r;
  }
  return out;
}
function candidate(v, context) {
  exact(v, ['id', 'goalIds', 'description', 'evidenceRefs', 'resourceRefs', 'effort', 'successCriteria', 'uncertainty'], true);
  return {
    id: string(v.id, 80, true),
    goalIds: goals(v.goalIds, context),
    description: string(v.description, 2000, true),
    evidenceRefs: references(v.evidenceRefs, context),
    resourceRefs: references(v.resourceRefs || [], context).map(k => {
      if (context.manifest[k].kind !== 'resource') fail('Invalid resource reference.');
      return k;
    }),
    effort: effort(v.effort),
    successCriteria: array(v.successCriteria, 5, true).map(x => string(x, 500, true)),
    uncertainty: array(v.uncertainty, 5, true).map(x => string(x, 500, true))
  };
}
function plan(v, context) {
  exact(v, ['title', 'goalIds', 'steps', 'successCriteria', 'uncertainty'], true);
  const steps = array(v.steps, 12, true).map(s => {
    exact(s, ['id', 'goalIds', 'description', 'evidenceRefs', 'resourceRefs', 'effort', 'successCriteria', 'uncertainty', 'dependsOn', 'existingTaskRefs'], true);
    const {
      dependsOn,
      existingTaskRefs,
      ...rest
    } = s;
    return {
      ...candidate(rest, context),
      dependsOn: array(dependsOn, 12, true).map(x => string(x, 80, true)),
      existingTaskRefs: references(existingTaskRefs || [], context).map(k => {
        if (context.manifest[k].authority !== 'Task') fail('Invalid task reference.');
        return k;
      })
    };
  });
  if (!steps.length) fail('A plan needs steps.');
  const ids = new Set(steps.map(s => s.id));
  if (ids.size !== steps.length) fail('Duplicate step IDs.');
  const done = new Set(),
    pending = [...steps];
  while (pending.length) {
    const i = pending.findIndex(s => s.dependsOn.every(d => done.has(d)));
    if (i < 0) fail('Missing or cyclic dependency.');
    done.add(pending.splice(i, 1)[0].id);
  }
  return {
    version: 'plan-v1',
    title: string(v.title, 200, true),
    goalIds: goals(v.goalIds, context),
    steps,
    status: 'draft',
    successCriteria: array(v.successCriteria, 10, true).map(x => string(x, 500, true)),
    uncertainty: array(v.uncertainty, 10, true).map(x => string(x, 500, true))
  };
}
function output(v, context) {
  exact(v, ['recommendations', 'plan', 'questions', 'constraintConflicts'], true);
  const recommendations = array(v.recommendations, 5, true).map(r => candidate(r, context));
  if (new Set(recommendations.map(r => r.id)).size !== recommendations.length) fail('Duplicate recommendation IDs.');
  const constraintConflicts = references(v.constraintConflicts || [], context);
  if (constraintConflicts.some(k => context.manifest[k].kind !== 'constraint')) fail('Invalid constraint reference.');
  return {
    recommendations,
    plan: v.plan ? plan(v.plan, context) : null,
    questions: array(v.questions || [], 5, true).map(q => string(q, 500, true)),
    constraintConflicts
  };
}
module.exports = {
  PURPOSES,
  exact,
  string,
  array,
  request,
  output,
  plan,
  references,
  fail
};
