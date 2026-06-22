const crypto = require('crypto');
const router = require('express').Router();
const CapitalLedgerEntry = require('../models/CapitalLedgerEntry');
const { logAuditEvent } = require('../utils/audit');

const normalizeText = (value = '', fallback = '') => String(value || fallback).trim();
const normalizeLower = (value = '', fallback = '') => normalizeText(value, fallback).toLowerCase();

const timingSafeEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireCapitalLedgerSecret = (req, res) => {
  const expectedSecret = process.env.MAKE_CAPITAL_LEDGER_SECRET;
  if (!expectedSecret) {
    res.status(503).json({
      success: false,
      message: 'Capital ledger intake is not configured on this service.',
    });
    return false;
  }

  const incomingSecret = String(req.headers['x-syzmeku-ledger-secret'] || '');
  if (!incomingSecret || !timingSafeEqual(incomingSecret, expectedSecret)) {
    res.status(404).json({ message: 'Not Found' });
    return false;
  }

  return true;
};

const parseAmountCents = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
};

const buildLedgerInput = (body = {}) => {
  const plan = body.plan || {};
  const action = plan.action || {};
  const payload = action.payload || body.payload || body;
  const transaction = payload.transaction || {};
  const client = payload.client || {};
  const fulfillment = payload.fulfillment || {};
  const tracking = payload.tracking || {};

  return {
    route: normalizeLower(payload.route, 'basis_capital_distribution_hub'),
    eventType: normalizeLower(payload.event_type || payload.eventType, 'capital_pipeline_event'),
    schemaVersion: normalizeText(payload.schema_version || payload.schemaVersion, 'unknown'),
    transaction: {
      status: normalizeLower(transaction.status, 'received'),
      currency: normalizeLower(transaction.currency, 'usd'),
      amountCents: parseAmountCents(transaction.amount_cents ?? transaction.amountCents),
      source: normalizeText(transaction.source, 'make_webhook'),
      externalReference: normalizeText(
        transaction.external_reference || transaction.externalReference || body.request_id || body.created_at,
        ''
      ),
      provider: normalizeText(transaction.provider, 'make'),
    },
    client: {
      status: normalizeLower(client.status, 'pending_profile_match'),
      source: normalizeText(client.source, 'syzmeku_local_daemon'),
      identifier: normalizeLower(client.identifier || client.email || body.client_identifier, ''),
      profileStage: normalizeText(client.profile_stage || client.profileStage, ''),
    },
    fulfillment: {
      alertRequired: Boolean(fulfillment.alert_required ?? fulfillment.alertRequired),
      queue: normalizeText(fulfillment.queue, 'basis_capital_distribution'),
      status: normalizeLower(fulfillment.status, 'queued'),
    },
    tracking: {
      repo: normalizeText(tracking.repo, 'SYZMEKU-engine'),
      backupRoot: normalizeText(tracking.backup_root || tracking.backupRoot, ''),
      jobId: normalizeText(tracking.job_id || tracking.jobId || body.job_id, ''),
    },
    rawPayload: body,
  };
};

router.post('/ledger', async (req, res) => {
  if (!requireCapitalLedgerSecret(req, res)) return undefined;

  try {
    const ledgerInput = buildLedgerInput(req.body);
    if (ledgerInput.route !== 'basis_capital_distribution_hub') {
      return res.status(400).json({
        success: false,
        message: 'Unsupported capital ledger route.',
        route: ledgerInput.route,
      });
    }

    const existingReference = ledgerInput.transaction.externalReference;
    const ledgerEntry = existingReference
      ? await CapitalLedgerEntry.findOneAndUpdate(
          { 'transaction.externalReference': existingReference },
          { $setOnInsert: ledgerInput },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      : await CapitalLedgerEntry.create(ledgerInput);

    await logAuditEvent({
      category: 'capital-ledger',
      event: 'basis-capital-ledger-entry',
      req,
      success: true,
      details: {
        route: ledgerEntry.route,
        eventType: ledgerEntry.eventType,
        amountCents: ledgerEntry.transaction.amountCents,
        fulfillmentQueue: ledgerEntry.fulfillment.queue,
      },
    });

    return res.status(201).json({
      success: true,
      ledgerId: ledgerEntry._id,
      route: ledgerEntry.route,
      eventType: ledgerEntry.eventType,
      fulfillment: ledgerEntry.fulfillment,
      transaction: ledgerEntry.transaction,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate capital ledger reference.',
      });
    }

    await logAuditEvent({
      category: 'capital-ledger',
      event: 'basis-capital-ledger-entry',
      req,
      success: false,
      details: { message: String(error?.message || error).slice(0, 300) },
    });

    return res.status(500).json({
      success: false,
      message: 'Unable to write capital ledger entry.',
      details: String(error?.message || error).slice(0, 300),
    });
  }
});

module.exports = router;
