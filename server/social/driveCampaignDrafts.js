'use strict';
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { createStore } = require('../enterprise/content/driveDraftStore');
const { hash } = require('../enterprise/content/qa');
const SocialCampaign = require('../models/SocialCampaign');
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (message, statusCode = 409) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
const current = record => record.versions.find(v => v.number === record.currentVersion);
const id = () => crypto.randomBytes(12).toString('hex');
const validate = campaign => { const error = new SocialCampaign(campaign).validateSync(); if (error) fail(error.message, 400); };
const assertGeneric = campaign => {
  if (campaign.metadata?.c0) fail('C0_REVIEW_REQUIRED');
  if (campaign.posts?.some(post => post.metadata?.c0MediaSha256)) fail('C0_LINKAGE_REQUIRED');
};
const legacyProjection = value => { const result = clone(value); return { ...result, expectedHash: hash(result), storage: 'legacy' }; };
const projection = record => ({ ...clone(current(record).package), expectedHash: current(record).hash, expectedRevision: record._drive.contentSha256, storage: 'google-drive', draftState: record.status });

function createCampaignDrafts({ owner, db = mongoose.connection.db, store, campaigns = SocialCampaign } = {}) {
  owner = String(owner || '');
  store ||= createStore({ db, owner });
  const getLegacy = campaignId => campaigns.findOne({ _id: campaignId, userId: owner });
  async function get(campaignId) {
    const legacy = await getLegacy(campaignId);
    if (legacy) {
      if (!legacy.metadata?.driveApproval) return legacyProjection(legacy);
      let receiptRecord;
      try { receiptRecord = await store.get(`social:${campaignId}`); } catch { /* Final campaigns remain readable during Drive outages. */ }
      return withReceiptStatus(legacy, receiptRecord);
    }
    const record = await store.get(`social:${campaignId}`);
    return record ? projection(record) : null;
  }
  async function list({ requireDrive = false } = {}) {
    const legacy = await campaigns.find({ userId: owner }).sort({ updatedAt: -1 }).limit(50);
    const persisted = new Set(legacy.map(c => String(c._id)));
    let records = [], storageError = null;
    try { records = await store.list(); } catch (error) { if (requireDrive) throw error; storageError = 'Drive approval drafts are unavailable. Existing final campaigns and historical records remain visible.'; }
    const drafts = records.filter(r => r.itemId.startsWith('social:') && !persisted.has(String(current(r).package._id))).map(projection);
    const receipts = new Map(records.map(record => [record.itemId, record]));
    const result = [...drafts, ...legacy.map(campaign => withReceiptStatus(campaign, receipts.get(`social:${campaign._id}`)))].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    result.storageError = storageError;
    return result;
  }
  async function create(input) {
    assertGeneric(input);
    const campaignId = id(), now = new Date().toISOString();
    const campaign = { ...clone(input), _id: campaignId, userId: owner, status: 'draft', approvedAt: null, scheduledAt: null, createdAt: now, updatedAt: now };
    delete campaign.expectedHash; delete campaign.expectedRevision; delete campaign.storage; delete campaign.draftState;
    campaign.posts = (campaign.posts || []).map(post => ({ ...post, _id: id(), publishStatus: 'draft', providerPostId: '', providerUrl: '', publishedAt: null, publishAttempts: 0, nextPublishAttemptAt: null, idempotencyKey: '', error: {}, analytics: {} }));
    validate(campaign);
    const record = { owner, itemId: `social:${campaignId}`, status: 'DRAFT', currentVersion: 1, versions: [{ number: 1, hash: hash(campaign), package: campaign }] };
    return projection(await store.save({ id: record.itemId, expectedHash: null, expectedContentSha256: null, record }));
  }
  async function edit(campaignId, expectedHash, expectedRevision, mutate) {
    const legacy = await getLegacy(campaignId);
    if (legacy) {
      const before = legacyProjection(legacy);
      assertGeneric(before);
      if (!expectedHash || before.expectedHash !== expectedHash) fail('CONTENT_VERSION_CHANGED');
      const next = mutate(clone(before));
      next.metadata = { ...next.metadata, sourceCampaignId: String(legacy._id) };
      return create(next); // Historical content is never overwritten, including published records.
    }
    const record = await store.get(`social:${campaignId}`);
    if (!record) fail('Campaign not found.', 404);
    if (record.status !== 'DRAFT') fail('DRAFT_NOT_EDITABLE');
    if (!expectedHash || current(record).hash !== expectedHash || !expectedRevision || record._drive.contentSha256 !== expectedRevision) fail('CONTENT_VERSION_CHANGED');
    const next = mutate(clone(current(record).package)); assertGeneric(next);
    next.status = 'draft'; next.approvedAt = null; next.updatedAt = new Date().toISOString();
    next.posts.forEach(post => { post._id ||= id(); post.publishStatus = 'draft'; });
    validate(next);
    const number = record.currentVersion + 1;
    const updated = { ...record, currentVersion: number, versions: [...record.versions, { number, hash: hash(next), package: next }] };
    return projection(await store.save({ id: record.itemId, expectedHash, expectedContentSha256: record._drive.contentSha256, record: updated }));
  }
  function assertApprovalReceipt(saved, campaignId, expectedHash, version) {
    const receipt = saved?.metadata?.driveApproval;
    if (!saved || String(saved._id) !== campaignId || String(saved.userId) !== owner || !saved.approvedAt
      || ['draft', 'generated'].includes(saved.status) || receipt?.itemId !== `social:${campaignId}`
      || receipt.hash !== expectedHash || !Number.isInteger(receipt.version) || receipt.version < 1
      || (version !== undefined && receipt.version !== version)) fail('CONTENT_VERSION_CHANGED');
    return receipt;
  }
  function matchesReceipt(record, receipt, campaignId) {
    return record?.owner === owner && record.itemId === receipt.itemId && record.currentVersion === receipt.version
      && current(record)?.hash === receipt.hash && String(current(record)?.package?._id) === campaignId
      && String(current(record)?.package?.userId) === owner;
  }
  function withReceiptStatus(saved, record) {
    const result = legacyProjection(saved), receipt = saved.metadata?.driveApproval;
    if (!receipt) return result;
    const campaignId = String(saved._id);
    let valid = true;
    try { assertApprovalReceipt(saved, campaignId, receipt.hash); } catch { valid = false; }
    const matches = valid && record && matchesReceipt(record, receipt, campaignId);
    const synced = matches && record.status === 'APPROVED';
    const mismatch = !valid || (record && (!matches || !['APPROVING', 'APPROVED'].includes(record.status)));
    return { ...result, receiptSync: { status: synced ? 'synced' : 'pending', itemId: receipt.itemId, hash: receipt.hash, version: receipt.version,
      ...(!synced ? { code: mismatch ? 'DRIVE_APPROVAL_RECEIPT_MISMATCH' : 'DRIVE_APPROVAL_RECEIPT_SYNC_PENDING' } : {}) } };
  }
  async function reconcileReceipt(saved, campaignId, expectedHash) {
    const receipt = assertApprovalReceipt(saved, campaignId, expectedHash);
    const result = (status, code = 'DRIVE_APPROVAL_RECEIPT_SYNC_PENDING') => ({ ...legacyProjection(saved), receiptSync: { status, itemId: receipt.itemId, hash: receipt.hash, version: receipt.version,
      ...(status === 'pending' ? { code } : {}) } });
    // A committed final record remains approved even when Drive cannot confirm its receipt.
    // Check the latest receipt before any retry; never repeat an uncertain Drive write blindly.
    let record;
    try { record = await store.get(receipt.itemId); } catch { return result('pending'); }
    if (!matchesReceipt(record, receipt, campaignId)) return result('pending', 'DRIVE_APPROVAL_RECEIPT_MISMATCH');
    if (record.status === 'APPROVED') return result('synced');
    if (record.status !== 'APPROVING') return result('pending', 'DRIVE_APPROVAL_RECEIPT_MISMATCH');
    try {
      await store.save({ id: receipt.itemId, expectedHash: receipt.hash, expectedContentSha256: record._drive.contentSha256, record: { ...record, status: 'APPROVED' } });
      return result('synced');
    } catch {
      // The pointer commit may have succeeded despite the lost response. Read, do not write again.
      try {
        const checked = await store.get(receipt.itemId);
        if (matchesReceipt(checked, receipt, campaignId) && checked.status === 'APPROVED') return result('synced');
      } catch { /* Receipt synchronization is unconfirmed, not final approval failure. */ }
      return result('pending');
    }
  }
  async function approve(campaignId, expectedHash, expectedRevision) {
    const legacy = await getLegacy(campaignId);
    if (legacy) {
      assertGeneric(legacy);
      if (expectedHash && legacy.metadata?.driveApproval?.hash === expectedHash) return reconcileReceipt(legacy, campaignId, expectedHash);
      fail('SAVE_DRIVE_REVIEW_VERSION_FIRST');
    }
    let record = await store.get(`social:${campaignId}`);
    if (!record) fail('Campaign not found.', 404);
    if (!expectedHash || current(record).hash !== expectedHash || !expectedRevision || record._drive.contentSha256 !== expectedRevision) fail('CONTENT_VERSION_CHANGED');
    const reviewed = current(record).package; assertGeneric(reviewed);
    if (record.status === 'DRAFT') {
      record = await store.save({ id: record.itemId, expectedHash, expectedContentSha256: record._drive.contentSha256, record: { ...record, status: 'APPROVING' } });
    } else if (record.status !== 'APPROVING') fail('DRAFT_NOT_APPROVABLE');
    // Only the exact locked, reviewed version crosses the boundary, already approved.
    // No schedule activation here. Publishing/scheduling each require a separate action.
    const approved = clone(reviewed);
    approved.status = 'approved'; approved.approvedAt = new Date();
    approved.posts.forEach(post => { post.publishStatus = 'approved'; });
    approved.metadata = { ...approved.metadata, driveApproval: { itemId: record.itemId, hash: expectedHash, version: record.currentVersion } };
    let saved;
    try { saved = await campaigns.create(approved); }
    catch (error) {
      // Any write error can be ambiguous, not only duplicate-key errors. Check the stable
      // campaign ID before allowing a subsequent request to attempt materialization again.
      try { saved = await getLegacy(campaignId); } catch { fail('APPROVAL_OUTCOME_UNCERTAIN', 503); }
      if (!saved) throw error;
    }
    assertApprovalReceipt(saved, campaignId, expectedHash, record.currentVersion);
    return reconcileReceipt(saved, campaignId, expectedHash);
  }
  return { create, get, list, edit, approve };
}
module.exports = { createCampaignDrafts, legacyProjection, assertGeneric };
