const crypto=require('node:crypto');
const {enabled,ownerId}=require('./policy');
const {collect}=require('./sources');
const {analyze}=require('./analysis');
const INTERVAL=15*60*1000;
async function runMonitor({db,env=process.env,collectImpl=collect,now=new Date()}){
  if(!enabled(env))return {status:'OFF'};
  const owner=ownerId(env),key='freedom-audit:'+owner,token=crypto.randomUUID(),state=db.collection('enterprisestates');
  // Native _id uniqueness; no index changes or business-authority mutations.
  try{await state.updateOne({_id:key},{$setOnInsert:{owner,leaseUntil:new Date(0),createdAt:now}},{upsert:true});}catch(e){if(e.code!==11000)throw e;}
  const lease=await state.updateOne({_id:key,leaseUntil:{$lte:now}},{$set:{leaseUntil:new Date(+now+10*60*1000),leaseToken:token}});
  if(!lease.modifiedCount)return {status:'BUSY'};
  try{
    const input=await collectImpl({db,owner,env,now}),brief=analyze(input),ledger=db.collection('enterprisedecisions');
    for(const finding of brief.findings){
      const evidenceHash=crypto.createHash('sha256').update(JSON.stringify(finding.evidence)).digest('hex'),id=key+':'+finding.id+':'+evidenceHash;
      await ledger.updateOne({_id:id},{$setOnInsert:{owner,findingId:finding.id,evidenceHash,problem:finding.title,evidence:finding.evidence,hypothesis:'Unconfirmed; investigate before intervention',proposedIntervention:finding.recommendation,baseline:{at:now,sales:brief.revenue.sales},expectedResult:'Improved measurement or resolution of the stated finding',actualResult:null,interpretation:null,decision:'pending',createdAt:now},$set:{lastObservedAt:now}},{upsert:true});
      const previous=await ledger.findOne({_id:id},{projection:{decision:1}});
      if(['revert','failed','rejected'].includes(previous?.decision)){finding.suppressed=true;finding.severity='INFO';finding.recommendation='Previous intervention declined or failed; do not repeat without changed evidence.';}
    }
    brief.approvalQueue=brief.findings.filter(x=>x.severity==='APPROVAL REQUIRED'&&!x.suppressed).slice(0,5);
    await state.updateOne({_id:key,leaseToken:token},{$set:{brief,lastSuccessAt:now,lastError:null,leaseUntil:new Date(+now+INTERVAL)},$unset:{leaseToken:''}});
    return {status:'OK'};
  }catch{
    await state.updateOne({_id:key,leaseToken:token},{$set:{lastError:'ENTERPRISE_READ_FAILED',lastErrorAt:now,leaseUntil:new Date(+now+INTERVAL)},$unset:{leaseToken:''}});
    return {status:'FAILED'};
  }
}
function startMonitor({connection,env=process.env}){
  if(!enabled(env))return ()=>{};
  let running=false;
  const tick=async()=>{if(running||connection.readyState!==1)return;running=true;try{await runMonitor({db:connection.db,env});}catch{console.warn('[enterprise] monitor unavailable');}finally{running=false;}};
  const initial=setTimeout(tick,30000),timer=setInterval(tick,INTERVAL);initial.unref();timer.unref();
  return ()=>{clearTimeout(initial);clearInterval(timer);};
}
module.exports={runMonitor,startMonitor,INTERVAL};
