'use strict';

// Explicit planning only. Creative content and every plan revision remain in the
// private Drive draft store. This module never schedules, publishes or generates.
const { enabled, ownerId } = require('../policy');
const { createStore } = require('./driveDraftStore');
const { hash } = require('./qa');
const { calendar } = require('./catalog');
const KIND = 'C0_PRODUCTION_PLAN';
const PLAN_ID = 'production-calendar';
const MAX_DAYS = 31;
const RECEIPT_LIMIT = 100;
const STEPS = Object.freeze(['COPY', 'IMAGE_SELECTION', 'VIDEO_ASSEMBLY', 'VIDEO_REVIEW', 'FINAL_APPROVAL', 'RELEASE']);
const STATUSES = Object.freeze(['PLANNED', 'IN_PROGRESS', 'WAITING_FOR_FOUNDER', 'BLOCKED', 'HOLD', 'COMPLETE', 'CANCELLED']);
const fail = (code, statusCode = 400) => { throw Object.assign(new Error(code), { statusCode }); };
const clone = value => JSON.parse(JSON.stringify(value));
const current = record => record?.versions?.find(v => v.number === record.currentVersion);
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys, code) => { if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) fail(code); };

function context({ db, owner, env = process.env, store }) {
  if (!enabled(env) || env.CONTENT_FACTORY_ENABLED !== 'true' || owner !== ownerId(env)) fail('NOT_FOUND', 404);
  return store || createStore({ db, owner });
}
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('PLAN_DATE_REQUIRED');
  const millis = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') fail('PLAN_DATE_INVALID');
  return millis;
}
function timeZoneValue(value) {
  if (typeof value !== 'string' || value.length > 80 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) fail('PLAN_TIMEZONE_REQUIRED');
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone; } catch { fail('PLAN_TIMEZONE_INVALID'); }
}
function datePlus(date, days) { return new Date(dateValue(date) + days * 86400000).toISOString().slice(0, 10); }
function localAt(millis, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(millis)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function timestamp(value, timeZone) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('PLAN_TIME_INVALID');
  dateValue(value.slice(0, 10));
  const nominal = Date.parse(value + ':00Z');
  // Probe offsets on both sides of a DST change, then round-trip the exact wall
  // time. Never silently move a nonexistent time or choose an ambiguous offset.
  const offsets = [...new Set([-36, 0, 36].map(hours => {
    const sample = nominal + hours * 3600000;
    return Date.parse(localAt(sample, timeZone) + ':00Z') - sample;
  }))];
  const candidates = offsets.map(offset => nominal - offset).filter(valueAt => localAt(valueAt, timeZone) === value);
  if (!candidates.length) fail('PLAN_TIME_DOES_NOT_EXIST');
  if (candidates.length > 1) fail('PLAN_TIME_AMBIGUOUS');
  return { local: value, timeZone, instant: new Date(candidates[0]).toISOString() };
}
function emptySlot(date) {
  return { date, format: 'LONG_FORM', itemRef: null, step: 'COPY', status: 'PLANNED', deadline: null, proposedPublication: null, note: '' };
}
function assertRecord(record, owner) {
  if (!record) return;
  const p = current(record)?.package;
  if (record.kind !== KIND || record.owner !== owner || record.itemId !== PLAN_ID || p?.kind !== KIND || p.schemaVersion !== 1 || !Array.isArray(p.slots) || p.slots.length < 1 || p.slots.length > MAX_DAYS || p.slots.length !== p.days) fail('PLAN_RECORD_INVALID', 409);
  if (timeZoneValue(p.timeZone) !== p.timeZone || p.endDate !== datePlus(p.startDate, p.days - 1) || p.slots.some((slot, index) => slot.date !== datePlus(p.startDate, index) || slot.format !== 'LONG_FORM')) fail('PLAN_RECORD_INVALID', 409);
}
function requestIdentity(input, action) {
  if (typeof input.operationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.operationId)) fail('PLAN_OPERATION_ID_REQUIRED');
  if (!((input.expectedHash === null && input.expectedRevision === null) || (isHash(input.expectedHash) && isHash(input.expectedRevision)))) fail('PLAN_EXACT_REVISION_REQUIRED');
  return { operationId: input.operationId, requestHash: hash({ action, ...input }) };
}
function replay(record, receipt) {
  const prior = record?.operations?.find(op => op.operationId === receipt.operationId);
  if (!prior) return false;
  if (prior.requestHash !== receipt.requestHash) fail('PLAN_OPERATION_REUSED', 409);
  return true;
}
function exact(record, input) {
  if ((record ? current(record).hash : null) !== input.expectedHash || (record?._drive?.contentSha256 || null) !== input.expectedRevision) fail('PLAN_VERSION_CHANGED', 409);
}
function summary(record) {
  if (!record) return null;
  return { ...clone(current(record).package), version: record.currentVersion, hash: current(record).hash, revision: record._drive.contentSha256,
    storage: { provider: 'GOOGLE_DRIVE', fileId: record._drive.fileId }, updatedAt: record.updatedAt,
    history: clone(record.history || []), previousRevision: record.previousRevision || null };
}
async function persist({ storage, owner, previous, plan, receipt, action, now }) {
  const at = now.toISOString(), version = (previous?.currentVersion || 0) + 1;
  const previousRevision = previous ? { version: previous.currentVersion, hash: current(previous).hash, revision: previous._drive.contentSha256, fileId: previous._drive.fileId, updatedAt: previous.updatedAt } : null;
  // The linked previous immutable file contains the entire older plan and its
  // predecessor. Bounded receipt/history windows do not delete older revisions.
  const record = { kind: KIND, owner, itemId: PLAN_ID, currentVersion: version, status: 'DRAFT', approval: null,
    versions: [{ number: version, hash: hash(plan), package: plan, createdAt: at }], previousRevision,
    history: [...(previous?.history || []), ...(previousRevision ? [previousRevision] : [])].slice(-30),
    operations: [...(previous?.operations || []), { ...receipt, version, action, at }].slice(-RECEIPT_LIMIT),
    createdAt: previous?.createdAt || at, updatedAt: at };
  const saved = await storage.save({ id: PLAN_ID, expectedHash: previous ? current(previous).hash : null, expectedContentSha256: previous?._drive.contentSha256 || null, record });
  return { plan: summary(saved), changed: true, execution: 'PRIVATE_DRIVE_PLAN_ONLY', scheduled: false };
}
function itemSnapshot(item) {
  return { id: item.id, version: item.version, hash: item.hash, revision: item.revision, title: item.package?.title || item.id,
    type: item.package?.type, status: item.status, storage: item.storage, imageApprovalRecorded: !!item.package?.production?.imageApproval,
    videoReviewRecorded: !!item.package?.production?.review,
    finalApprovalRecorded: item.status === 'APPROVED' && item.approval?.hash === item.hash && item.approval?.version === item.version,
    release: item.release && item.status === 'APPROVED' && item.release.hash === item.hash && item.release.version === item.version ? {
      status: item.release.status, campaignId: item.release.campaignId, provider: item.release.provider, scheduledTimeProposal: item.release.scheduledTime || null,
      publication: 'NOT_CONFIRMED_BY_CALENDAR' } : null };
}
function observed(slot, candidates) {
  if (!slot.itemRef) return { status: 'UNASSIGNED', message: 'No content has been prepared for this slot.' };
  const item = candidates.find(candidate => candidate.id === slot.itemRef.id);
  if (!item) return { status: 'UNAVAILABLE', message: 'The linked content is not available in the current queue.' };
  if (item.hash !== slot.itemRef.hash || item.revision !== slot.itemRef.revision || item.version !== slot.itemRef.version) return { status: 'CHANGED', message: 'Content changed after this plan was saved. Select its current revision explicitly.' };
  if (['HOLD', 'REJECTED'].includes(item.status)) return { status: item.status, message: 'The content decision blocks further production.' };
  return { status: 'CURRENT', itemStatus: item.status, imageApprovalRecorded: item.imageApprovalRecorded, videoReviewRecorded: item.videoReviewRecorded,
    finalApprovalRecorded: item.finalApprovalRecorded, release: item.release,
    message: 'Recorded workflow state only. Exact sources and approval are rechecked by the production/release actions.' };
}
async function read(options) {
  const storage = context(options), record = await storage.get(PLAN_ID);
  assertRecord(record, options.owner);
  const content = await (options.contentService || require('./service')).list(options.db, options.owner, { store: storage });
  const candidates = content.items.filter(item => ['longform', 'longform-outline'].includes(item.package?.type)).map(itemSnapshot);
  const plan = summary(record);
  if (plan) plan.slots = plan.slots.map(slot => ({ ...slot, observed: observed(slot, candidates) }));
  return { plan, candidates, defaults: { timeZone: 'America/Chicago', startDate: null, maxDays: MAX_DAYS }, steps: STEPS, statuses: STATUSES,
    catalog: { preparedDays: calendar().length, automaticGeneration: false, note: 'The prepared catalog covers seven days. Planning more dates creates empty production slots, not creative content.' },
    storage: { provider: 'GOOGLE_DRIVE', error: content.storage?.error || null, exclusiveDrafts: true },
    publication: { schedulingEnabled: false, postingTimes: 'FOUNDER_PROPOSALS_ONLY', analyticsRecommendation: 'No optimal publication time or distribution algorithm has been established.' } };
}
async function setWindow(options) {
  const { owner, input, now = new Date() } = options;
  onlyKeys(input, ['operationId', 'expectedHash', 'expectedRevision', 'startDate', 'timeZone', 'days'], 'PLAN_WINDOW_INVALID');
  const receipt = requestIdentity(input, 'SET_WINDOW');
  dateValue(input.startDate);
  const timeZone = timeZoneValue(input.timeZone);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAYS) fail('PLAN_HORIZON_INVALID');
  const endDate = datePlus(input.startDate, input.days - 1);
  dateValue(endDate);
  const storage = context(options), previous = await storage.get(PLAN_ID);
  assertRecord(previous, owner);
  if (replay(previous, receipt)) return { plan: summary(previous), changed: false, replayed: true, scheduled: false };
  exact(previous, input);
  const old = current(previous)?.package;
  if (old && old.timeZone !== timeZone && old.slots.some(slot => slot.deadline || slot.proposedPublication)) fail('PLAN_TIMEZONE_HAS_TIMES', 409);
  const plan = { kind: KIND, schemaVersion: 1, startDate: input.startDate, endDate, timeZone, days: input.days,
    slots: Array.from({ length: input.days }, (_, index) => { const date = datePlus(input.startDate, index); return clone(old?.slots.find(slot => slot.date === date) || emptySlot(date)); }) };
  if (old && hash(old) === hash(plan)) return { plan: summary(previous), changed: false, scheduled: false };
  return persist({ storage, owner, previous, plan, receipt, action: 'SET_WINDOW', now });
}
function validRef(ref) {
  onlyKeys(ref, ['id', 'hash', 'revision', 'version'], 'PLAN_ITEM_REFERENCE_INVALID');
  if (typeof ref.id !== 'string' || !/^[a-zA-Z0-9_:-]{1,160}$/.test(ref.id) || !isHash(ref.hash) || !isHash(ref.revision) || !Number.isInteger(ref.version) || ref.version < 1) fail('PLAN_ITEM_REFERENCE_INVALID');
}
async function updateSlot(options) {
  const { owner, date, input, now = new Date() } = options;
  dateValue(date);
  onlyKeys(input, ['operationId', 'expectedHash', 'expectedRevision', 'patch'], 'PLAN_SLOT_INVALID');
  onlyKeys(input.patch, ['itemRef', 'step', 'status', 'deadlineLocal', 'proposedPublicationLocal', 'note'], 'PLAN_SLOT_INVALID');
  if (!Object.keys(input.patch).length) fail('PLAN_SLOT_INVALID');
  const receipt = requestIdentity(input, `UPDATE_SLOT:${date}`), storage = context(options), previous = await storage.get(PLAN_ID);
  assertRecord(previous, owner);
  if (replay(previous, receipt)) return { plan: summary(previous), changed: false, replayed: true, scheduled: false };
  exact(previous, input);
  if (!previous) fail('PLAN_START_REQUIRED', 409);
  const plan = clone(current(previous).package), index = plan.slots.findIndex(slot => slot.date === date);
  if (index < 0) fail('PLAN_DATE_OUTSIDE_WINDOW', 409);
  const patch = input.patch, slot = { ...plan.slots[index] };
  if ('step' in patch) { if (!STEPS.includes(patch.step)) fail('PLAN_STEP_INVALID'); slot.step = patch.step; }
  if ('status' in patch) { if (!STATUSES.includes(patch.status)) fail('PLAN_STATUS_INVALID'); slot.status = patch.status; }
  if ('note' in patch) { if (typeof patch.note !== 'string' || patch.note.length > 1000) fail('PLAN_NOTE_INVALID'); slot.note = patch.note; }
  if ('deadlineLocal' in patch) slot.deadline = timestamp(patch.deadlineLocal, plan.timeZone);
  if ('proposedPublicationLocal' in patch) slot.proposedPublication = timestamp(patch.proposedPublicationLocal, plan.timeZone);
  if ('itemRef' in patch) { if (patch.itemRef !== null) validRef(patch.itemRef); slot.itemRef = clone(patch.itemRef); }
  if (slot.itemRef) {
    const item = await storage.get(slot.itemRef.id), p = current(item)?.package;
    if (item?.kind !== 'C0_ITEM' || item.owner !== owner || !['longform', 'longform-outline'].includes(p?.type)) fail('PLAN_DRIVE_LONGFORM_REQUIRED', 409);
    if (item.currentVersion !== slot.itemRef.version || current(item).hash !== slot.itemRef.hash || item._drive.contentSha256 !== slot.itemRef.revision) fail('PLAN_CONTENT_CHANGED', 409);
    if (plan.slots.some((other, i) => i !== index && other.itemRef?.id === slot.itemRef.id && other.status !== 'CANCELLED') && slot.status !== 'CANCELLED') fail('PLAN_CONTENT_ALREADY_ASSIGNED', 409);
    if (['IN_PROGRESS', 'COMPLETE'].includes(slot.status)) {
      if (['HOLD', 'REJECTED'].includes(item.status)) fail('PLAN_CONTENT_ON_HOLD', 409);
      if (['VIDEO_ASSEMBLY', 'VIDEO_REVIEW', 'FINAL_APPROVAL', 'RELEASE'].includes(slot.step) && !p.production?.imageApproval) fail('FOUNDER_IMAGE_APPROVAL_REQUIRED', 409);
      if (['FINAL_APPROVAL', 'RELEASE'].includes(slot.step) && !p.production?.review) fail('PLAN_VIDEO_REVIEW_REQUIRED', 409);
      if ((slot.step === 'RELEASE' || slot.status === 'COMPLETE') && !(item.status === 'APPROVED' && item.approval?.hash === slot.itemRef.hash && item.approval?.version === slot.itemRef.version)) fail('PLAN_FINAL_APPROVAL_REQUIRED', 409);
      if (slot.step === 'RELEASE' && slot.status === 'COMPLETE' && !(item.release?.status === 'RELEASED' && item.release.hash === slot.itemRef.hash && item.release.version === slot.itemRef.version)) fail('PLAN_RELEASE_RECEIPT_REQUIRED', 409);
    }
  } else if (['IN_PROGRESS', 'COMPLETE'].includes(slot.status)) fail('PLAN_CONTENT_REQUIRED', 409);
  plan.slots[index] = slot;
  if (hash(plan) === current(previous).hash) return { plan: summary(previous), changed: false, scheduled: false };
  return persist({ storage, owner, previous, plan, receipt, action: `UPDATE_SLOT:${date}`, now });
}
module.exports = { read, setWindow, updateSlot, PLAN_ID, KIND, MAX_DAYS, STEPS, STATUSES, dateValue, timeZoneValue, timestamp };
