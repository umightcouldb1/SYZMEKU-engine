// Aggregate-only historical reconciliation. Default is read-only; --apply is
// reserved for an explicitly approved policy/backfill. Uses existing service
// credentials, never prints keys, customer data, account IDs or purchase IDs.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Stripe = require('stripe');
const UserProfile = require('../models/UserProfile');
const { synchronizeCheckout } = require('../services/stripeEntitlements');
async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const account = args.find(x => x.startsWith('--account='))?.slice(10);
  const limitText = args.find(x => x.startsWith('--limit='))?.slice(8) || '100';
  const limit = Number(limitText);
  if (!account || !/^acct_[a-zA-Z0-9]+$/.test(account) || !Number.isInteger(limit) || limit < 1 || limit > 500) throw Error('Invalid explicit account or limit.');
  if (apply) throw Error('Apply is disabled until the access policy and historical backfill are explicitly approved.');
  const key = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Secret_Key;
  if (!key || !process.env.MONGO_URI) throw Error('Existing service credentials are not configured.');
  const stripe = Stripe(key);
  if ((await stripe.accounts.retrieve()).id !== account) throw Error('Stripe account mismatch.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const summary = { mode: 'dry-run', examined: 0, proposedChanges: 0, fullRefunds: 0, disputes: 0, errors: 0, truncated: false };
  const cursor = UserProfile.find({ 'purchasedProducts.checkoutSessionId': { $regex: '^cs_' } }).select('userId purchasedProducts.checkoutSessionId').lean().cursor();
  for await (const profile of cursor) {
    const ids = [...new Set(profile.purchasedProducts.map(p => p.checkoutSessionId).filter(id => /^cs_/.test(id || '')))];
    for (const id of ids) {
      if (summary.examined >= limit) { summary.truncated = true; break; }
      summary.examined++;
      try {
        const preview = await synchronizeCheckout(stripe, id, { expectedUserId: profile.userId, dryRun: true });
        if (preview?.changed) summary.proposedChanges++;
        if (preview?.fullyRefunded) summary.fullRefunds++;
        if (preview?.disputeStatus) summary.disputes++;
      } catch (_error) { summary.errors++; }
    }
    if (summary.truncated) break;
  }
  await cursor.close();
  console.log(JSON.stringify(summary));
}
run().catch(() => { console.error('Reconciliation stopped. Check approved account, configuration and provider availability; no customer details are logged.'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
