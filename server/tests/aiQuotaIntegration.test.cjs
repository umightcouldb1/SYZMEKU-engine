// Disposable Mongo only. Provider transport is never invoked by this fixture.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test'; delete process.env.MONGO_URI;
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { reserveAiUsage, FREE_DAILY_ATTEMPTS } = require('../services/aiQuotaService');
const Bucket = require('../models/AiQuotaBucket');
let db;
before(async () => { db = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(db.getUri()); await Bucket.init(); });
after(async () => { await mongoose.disconnect(); if (db) await db.stop(); });
test('real Mongo atomically admits at most the shared daily quota under concurrency and module restart', async () => {
  const results = await Promise.allSettled(Array.from({ length: FREE_DAILY_ATTEMPTS + 30 }, () => reserveAiUsage()));
  // A racing first upsert may conservatively reject an admission; it must never
  // overspend. Retry any early contention until the bucket is exactly full.
  let accepted = results.filter(result => result.status === 'fulfilled').length;
  for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.statusCode, 429);
  while (accepted < FREE_DAILY_ATTEMPTS) { await reserveAiUsage(); accepted++; }
  assert.equal(await Bucket.countDocuments(), 1);
  assert.equal((await Bucket.findOne()).attempts, FREE_DAILY_ATTEMPTS);
  delete require.cache[require.resolve('../services/aiQuotaService')];
  const restarted = require('../services/aiQuotaService');
  await assert.rejects(() => restarted.reserveAiUsage(), { statusCode: 429 });
  assert.equal((await Bucket.findOne()).attempts, FREE_DAILY_ATTEMPTS);
});

test('real Mongo keeps the existing paid product hourly limit shared across service restarts',async()=>{
 const User=require('../models/User'),Profile=require('../models/UserProfile');const {runWithRequestContext}=require('../utils/requestContext');
 const user=await User.create({name:'Quota paid',username:'quota-paid',email:'quota-paid@example.test',password:'synthetic-only'});process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID='price_quota_fixture';await Profile.create({userId:user._id,purchasedProducts:[{productId:'prod_quota_fixture',priceId:'price_quota_fixture',status:'paid'}]});
 const context={authenticated:true,userId:String(user._id),sessionId:'fixture-only',aiProduct:'freedom-audit'};const call=()=>runWithRequestContext(context,()=>require('../services/aiQuotaService').reserveAiUsage());
 for(let i=0;i<30;i++)assert.equal((await call()).entitlement,'paid');delete require.cache[require.resolve('../services/aiQuotaService')];await assert.rejects(call,{code:'AI_PAID_QUOTA_EXHAUSTED'});delete process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID;
});
