const { ObjectId } = require('mongoose').mongo;
const START = '2026-09-09T05:00:00.000Z';
const {readSocial}=require('./socialRead');
async function collect({ db, owner, env = process.env, stripe, fetchImpl = fetch, now = new Date() }) {
  if (!/^[a-f0-9]{24}$/.test(owner)) throw Error('Enterprise owner required');
  const userId=new ObjectId(owner),start=new Date(START),range={$gte:start,$lte:now};
  if(!env.FREEDOM_AUDIT_STRIPE_PRICE_ID)throw Error('Product scope required');
  if(!await db.collection('users').findOne({_id:userId,role:'COMMANDER_IN_CHIEF'},{projection:{_id:1}}))throw Error('Enterprise owner unavailable');
  // These are the complete business authorities. No general context loader or personal model is imported.
  const campaigns=await db.collection('socialcampaigns').find({userId},{projection:{name:1,'posts._id':1,'posts.provider':1,'posts.title':1,'posts.format':1,'posts.link':1,'posts.publishStatus':1,'posts.publishedAt':1,'posts.error.code':1,'posts.connectedAccountId':1,'posts.providerPostId':1}}).limit(100).toArray();
  const posts=campaigns.flatMap(c=>c.posts.map(p=>{let url;try{url=new URL(p.link);}catch{}return {id:String(p._id),campaign:String(c._id),name:c.name,title:p.title,platform:p.provider,format:p.format,status:p.publishStatus,publishedAt:p.publishedAt,errorCode:p.error?.code||null,inWindow:p.publishedAt>=start&&p.publishedAt<=now,platformAttribution:!!url?.searchParams.get('utm_source'),postAttribution:!!url?.searchParams.get('utm_content')};}));
  const snapshots=await db.collection('socialanalyticssnapshots').countDocuments({userId,timestamp:range});
  const measurements=await readSocial({db,userId,posts:campaigns.flatMap(c=>c.posts).filter(p=>p.publishedAt>=start&&p.publishedAt<=now),fetchImpl,env});
  const connections=await db.collection('socialconnections').find({userId},{projection:{_id:0,provider:1,accountType:1,active:1,tokenExpiresAt:1}}).toArray();
  const auth=await db.collection('auditlogs').aggregate([{$match:{category:'auth',createdAt:range}},{$group:{_id:{event:'$event',success:'$success'},count:{$sum:1}}}]).toArray();
  const entitlements=await db.collection('userprofiles').aggregate([{$match:{userId:{$ne:userId}}},{$unwind:'$purchasedProducts'},{$match:{'purchasedProducts.priceId':env.FREEDOM_AUDIT_STRIPE_PRICE_ID,'purchasedProducts.status':'paid','purchasedProducts.purchasedAt':range}},{$count:'count'}]).toArray();
  const completions=await db.collection('userprofiles').aggregate([{$match:{userId:{$ne:userId}}},{$project:{dates:'$freedomAudit.results.completedAt'}},{$unwind:'$dates'},{$match:{dates:range}},{$count:'count'}]).toArray();
  const counts=await db.collection('enterpriseevents').aggregate([{$match:{product:'freedom-audit',receivedAt:range}},{$group:{_id:'$event',count:{$sum:1}}}]).toArray();
  const first=await db.collection('enterpriseevents').find({product:'freedom-audit'},{projection:{receivedAt:1}}).sort({receivedAt:1}).limit(1).toArray();
  const commerce={ok:false,customerSessions:0,founderSessions:0,sales:0,revenue:0,attempts:0,paymentAttribution:'NOT INSTRUMENTED'};
  try {
    const api=stripe||require('stripe')(env.STRIPE_SECRET_KEY,{timeout:15000,maxNetworkRetries:0});
    let total=0;
    for await(const session of api.checkout.sessions.list({created:{gte:Math.floor(+start/1000),lte:Math.floor(+now/1000)},limit:100,expand:['data.payment_intent.latest_charge']})){
      if(++total>2000)throw Error('Read limit exceeded');
      if(session.metadata?.productSlug!=='freedom-audit'&&session.metadata?.priceId!==env.FREEDOM_AUDIT_STRIPE_PRICE_ID&&session.metadata?.price_id!==env.FREEDOM_AUDIT_STRIPE_PRICE_ID)continue;
      if(session.client_reference_id===owner){commerce.founderSessions++;continue;}
      commerce.customerSessions++;
      if(session.payment_intent?.latest_charge)commerce.attempts++;
      if(session.payment_status==='paid'){if(session.currency!=='usd')throw Error('Unexpected currency');commerce.sales++;commerce.revenue+=session.amount_total;}
    }
    commerce.webhooks=(await api.webhookEndpoints.list({limit:100})).data.map(w=>({enabled:w.status==='enabled',checkoutCompleted:w.enabled_events.includes('checkout.session.completed')||w.enabled_events.includes('*')}));
    commerce.ok=true;
  }catch{commerce.ok=false;commerce.attempts=null;commerce.revenue=null;}
  const health={};
  for(const [name,url] of Object.entries({api:'https://syzmeku-api.onrender.com/',app:'https://www.toisouljahacademy.com/app',freedom:'https://freedom.toisouljahacademy.com/'})){
    const began=Date.now();try{const response=await fetchImpl(url,{signal:AbortSignal.timeout(10000),redirect:'error'});health[name]={status:response.status,latencyMs:Date.now()-began};await response.body?.cancel();}catch{health[name]={status:'UNAVAILABLE'};}
  }
  return {window:{start:START,end:now.toISOString(),timeZone:'America/Chicago'},social:{posts,connections,measurements,snapshotCount:snapshots,coverage:campaigns.length===100?'LIMITED — campaign read cap':'Owned campaign receipts; per-post analytics coverage shown separately'},auth,commerce,
    product:{entitlements:entitlements[0]?.count||0,completions:completions[0]?.count||0},telemetry:{counts,since:first[0]?.receivedAt||null},health,
    personalExecution:env.CORE_PERSONAL_EXECUTION_ENABLED==='true'?'ENABLED — unexpected':'DISABLED',m3:env.CORE_REASONING_RECONCILIATION_ENABLED==='true'?'ON — unexpected':'OFF'};
}
module.exports={collect,START};
