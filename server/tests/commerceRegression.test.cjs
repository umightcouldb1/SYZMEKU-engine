const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'synthetic-commerce-auth',CORE_CONTEXT_WRITES_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',FREEDOM_AUDIT_STRIPE_PRICE_ID:'price_fixture',FREEDOM_AUDIT_APP_URL:'https://example.test',DOMAIN:'https://example.test'});
delete process.env.MONGO_URI;process.env.MONGOMS_DOWNLOAD_DIR=path.resolve(__dirname,'../../.cache/mongodb-binaries');
const mongoose=require('mongoose');const express=require('express');const jwt=require('jsonwebtoken');const {MongoMemoryReplSet}=require('mongodb-memory-server');
const User=require('../models/User');const AuthSession=require('../models/AuthSession');const UserProfile=require('../models/UserProfile');const SocialCampaign=require('../models/SocialCampaign');
const realStripe=require('stripe')('sk_test_fixture');let session,checkoutInput,priceAmount=3700;
const price={id:'price_fixture',active:true,currency:'usd',product:{id:'prod_fixture',name:'The Freedom Audit',active:true}};
const fakeStripe={webhooks:realStripe.webhooks,prices:{retrieve:async()=>({...price,unit_amount:priceAmount})},checkout:{sessions:{create:async input=>{checkoutInput=input;return {url:'https://example.test/mock-checkout'};},retrieve:async()=>session,listLineItems:async()=>({data:[{price,amount_total:3700,currency:'usd'}]})}}};
require.cache[require.resolve('stripe')].exports=()=>fakeStripe;
let db,server,base,a,b;
async function makeUser(name,role){const u=await User.create({name,username:name,email:name+'@example.test',password:'fixture',role});const sid='commerce-'+name;await AuthSession.create({userId:u._id,sessionId:sid,expiresAt:new Date(Date.now()+600000)});return {id:String(u._id),token:jwt.sign({id:String(u._id),sid},process.env.JWT_SECRET)};}
async function request(u,route,method='GET',body){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+u.token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
before(async()=>{db=await MongoMemoryReplSet.create({replSet:{count:1,dbName:'commerce_fixtures'}});await mongoose.connect(db.getUri());await require('../models/LifeContext').createIndexes();await require('../models/Memory').createIndexes();a=await makeUser('buyer','USER');b=await makeUser('operator','COMMANDER_IN_CHIEF');
 process.env.CORE_CONTEXT_WRITE_USER_IDS=[a.id,b.id].join(',');
 const app=express();app.use('/webhook',require('../routes/webhook'));app.use(express.json());app.use('/audit',require('../routes/freedomAuditRoutes'));app.use('/social',require('../routes/socialCommandRoutes'));app.use('/core',require('../routes/coreContextRoutes'));app.use((e,_req,res,_next)=>res.status(e.statusCode || (res.statusCode>=400?res.statusCode:500)).json({error:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 session={id:'cs_fixture',client_reference_id:a.id,mode:'payment',status:'complete',payment_status:'paid'};
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();});
test('shared auth preserves checkout ownership, fixed price and unpaid restrictions',async()=>{
 assert.equal((await request(null,'/audit/checkout/session','POST',{})).status,401);
 assert.equal((await request(a,'/audit/results','POST',{})).status,403);
 assert.equal((await request(a,'/audit/checkout/session','POST',{userId:b.id,priceId:'spoof'})).status,200);
 assert.equal(checkoutInput.client_reference_id,a.id);assert.equal(checkoutInput.metadata.userId,a.id);assert.deepEqual(checkoutInput.line_items,[{price:'price_fixture',quantity:1}]);assert.equal(checkoutInput.mode,'payment');
 priceAmount=1;assert.equal((await request(a,'/audit/checkout/session','POST',{})).status,503);priceAmount=3700;
 assert.equal((await request(b,'/audit/checkout/verify','POST',{sessionId:'cs_fixture'})).status,403);
 session.payment_status='unpaid';assert.equal((await request(a,'/audit/checkout/verify','POST',{sessionId:'cs_fixture'})).status,402);session.payment_status='paid';
});
test('real Stripe signature verification and webhook replay preserve one paid entitlement without Core scope',async()=>{
 const body=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',data:{object:session}});
 const send=signature=>fetch(base+'/webhook/stripe',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body});
 assert.equal((await send('invalid')).status,400);
 const signature=realStripe.webhooks.generateTestHeaderString({payload:body,secret:process.env.STRIPE_WEBHOOK_SECRET});
 assert.equal((await send(signature)).status,200);assert.equal((await send(signature)).status,200);
 assert.equal((await UserProfile.findOne({userId:a.id})).purchasedProducts.length,1);
 assert.equal((await request(a,'/audit/entitlement')).data.entitled,true);
 assert.equal((await request(b,'/audit/entitlement')).data.entitled,false);
 assert.equal((await request(a,'/audit/checkout/verify','POST',{sessionId:'cs_fixture'})).status,200);
});
test('Freedom Audit scoring/stage and ten-result retention are unchanged',async()=>{
 const ratings=Object.fromEntries(['time','money','obligations','assets','desires'].map(k=>[k,[4,4,4,4]]));
 for(let i=0;i<11;i++){const r=await request(a,'/audit/results','POST',{ratings,win:'Publish my portfolio'});assert.equal(r.status,201);assert.equal(r.data.result.score,80);assert.equal(r.data.result.stage,'Expand');assert.equal(r.data.result.weakestDomain,'time');}
 assert.equal((await UserProfile.findOne({userId:a.id})).freedomAudit.results.length,10);
 ratings.time=[0,4,4,4];assert.equal((await request(a,'/audit/results','POST',{ratings})).status,400);
});
test('Social roles/providers and campaign ownership survive shared auth; Core deletion preserves commerce and Operations',async()=>{
 assert.equal((await request(a,'/social/providers')).status,404);
 assert.equal((await request(b,'/social/providers')).status,200);
 const campaign=await SocialCampaign.create({userId:b.id,name:'Operations fixture'});
 assert.equal((await request(b,'/social/campaigns/'+campaign._id)).status,200);
 const commerceBefore=JSON.stringify((await UserProfile.findOne({userId:a.id})).toObject());
 assert.equal((await request(a,'/core/context','DELETE')).status,200);
 assert.equal(JSON.stringify((await UserProfile.findOne({userId:a.id})).toObject()),commerceBefore);
 assert.equal((await request(b,'/core/context','DELETE')).status,200);
 assert(await SocialCampaign.findById(campaign._id));
 process.env.CORE_CONTEXT_WRITE_USER_IDS='';
 try {
  for (const flag of ['false','true']) {
   process.env.CORE_CONTEXT_WRITES_ENABLED=flag;
   assert.equal((await request(a,'/audit/checkout/session','POST',{})).status,200);
   assert.equal((await request(b,'/social/campaigns')).status,200);
  }
 } finally {process.env.CORE_CONTEXT_WRITES_ENABLED='true';process.env.CORE_CONTEXT_WRITE_USER_IDS=[a.id,b.id].join(',');}
});
