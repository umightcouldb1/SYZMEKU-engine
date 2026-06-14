require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../server/models/User');
const AutomationLog = require('../server/models/AutomationLog');
const { findAdminByEmail, normalizeEmail } = require('../server/utils/adminIdentity');

const HISTORIC_SMOKE_TEST = {
  command: 'workspace_smoke_test',
  status: 'succeeded',
  mode: 'draft_only_no_send',
  request: {
    source: 'outputs/run-draft-smoke-test.ps1',
    targetGrid: 'Springfield/Republic, MO',
    smokeTest: true,
  },
  resultSummary: 'Historic first SYZMEKU Workspace OAuth smoke test created a Google Slides presentation and Gmail draft without sending email.',
  assets: [
    {
      provider: 'google_slides',
      assetType: 'presentation',
      assetId: '1aMQVC-gB36hdGd3z3EoI_x60cu5q3tZsDQ3DMbI3AKQ',
      url: 'https://docs.google.com/presentation/d/1aMQVC-gB36hdGd3z3EoI_x60cu5q3tZsDQ3DMbI3AKQ/edit',
      title: 'SYZMEKU Automation Smoke Test',
      metadata: {
        targetGrid: 'Springfield/Republic, MO',
      },
    },
    {
      provider: 'gmail',
      assetType: 'gmail_draft',
      assetId: 'r3623038268855751073',
      messageId: '19ec3d35782587e9',
      title: 'SYZMEKU Automation Smoke Test Draft',
      metadata: {
        targetGrid: 'Springfield/Republic, MO',
        mode: 'draft_only_no_send',
      },
    },
  ],
  completedAt: new Date('2026-06-14T01:51:05.000Z'),
};

const getCommander = async () => {
  const requestedEmail = normalizeEmail(process.env.BACKFILL_COMMANDER_EMAIL || process.env.ADMIN_EMAIL || 'umightcouldb1@toisouljahacademy.com');
  let commander = requestedEmail ? await findAdminByEmail(requestedEmail) : null;

  if (!commander) {
    commander = await User.findOne({ role: User.ROLES.COMMANDER_IN_CHIEF }).sort({ createdAt: 1 });
  }

  if (!commander) {
    throw new Error('No COMMANDER_IN_CHIEF user found for AutomationLog backfill. Set BACKFILL_COMMANDER_EMAIL or create the commander account first.');
  }

  return commander;
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to backfill AutomationLog.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const commander = await getCommander();

  const query = {
    command: HISTORIC_SMOKE_TEST.command,
    'assets.assetId': '1aMQVC-gB36hdGd3z3EoI_x60cu5q3tZsDQ3DMbI3AKQ',
  };

  const update = {
    $set: {
      ...HISTORIC_SMOKE_TEST,
      userId: commander._id,
      updatedAt: new Date(),
    },
    $setOnInsert: {
      createdAt: HISTORIC_SMOKE_TEST.completedAt,
    },
  };

  const log = await AutomationLog.findOneAndUpdate(query, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });

  console.log(JSON.stringify({
    success: true,
    action: 'workspace_smoke_test_backfilled',
    automationLogId: String(log._id),
    commanderId: String(commander._id),
    commanderEmail: commander.email,
    assets: log.assets.map((asset) => ({
      provider: asset.provider,
      assetType: asset.assetType,
      assetId: asset.assetId,
      messageId: asset.messageId,
      url: asset.url,
    })),
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
