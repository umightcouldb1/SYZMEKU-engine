#!/usr/bin/env node
// M1 intentionally contains NO apply/backfill mode. Raw driver reads only; importing
// this module never connects, loads a server/router, or starts a scheduler.
const fs = require('node:fs');
const COLLECTIONS = {
  strategicmemories:'userId', memories:'userId', signalentries:'userId', tasks:'userId',
  systems:'userId', protocols:'userId', agentloopstates:'userId', kernelsnapshots:'userId',
  kernelcycles:'userId', actionexecutions:'userId', alertrecords:'userId', systemexecutions:'userId',
  protocolexecutionrecords:'userId', lifecontexts:'user_id', mentorprofiles:'user_id',
  mentorsignals:'user_id', mentortasks:'user_id', mentormessages:'user_id', loopstatuses:'user_id',
  userprotocolstates:'user_id', behavioralrhythms:'user_id', emotionalpatterns:'user_id',
  colorprofiles:'user_id', sensoryprofiles:'user_id', symbolicinterests:'user_id', datarequests:'userId',
};
function inventorySnapshot(snapshot) {
  const users=new Set(snapshot.userIds || []);
  return Object.entries(COLLECTIONS).map(([collection,ownerKey])=>{
    const docs=snapshot.collections?.[collection] || [];
    const result={collection,ownerKey,total:docs.length,owned:0,unowned:0,orphaned:0,invalidOwnerType:0,indexes:[]};
    for(const doc of docs) {
      const owner=doc[ownerKey];
      if(owner===undefined || owner===null || owner==='') result.unowned++;
      else if(!/^[a-f\d]{24}$/i.test(String(owner))) result.invalidOwnerType++;
      else if(!users.has(String(owner))) result.orphaned++;
      else result.owned++;
    }
    return result;
  });
}
async function inventoryDatabase(uri) {
  const {MongoClient}=require('mongoose').mongo;
  const client=new MongoClient(uri,{serverSelectionTimeoutMS:15000,readPreference:'secondaryPreferred',appName:'SYZMEKU-M1-read-only-inventory'});
  try {
    await client.connect();const db=client.db();const result=[];
    for(const [collection,ownerKey] of Object.entries(COLLECTIONS)) {
      const rows=await db.collection(collection).aggregate([
        {$project:{owner:'$'+ownerKey,ownerType:{$type:'$'+ownerKey}}},
        {$lookup:{from:'users',localField:'owner',foreignField:'_id',as:'account'}},
        {$group:{_id:null,total:{$sum:1},owned:{$sum:{$cond:[{$and:[{$eq:['$ownerType','objectId']},{$gt:[{$size:'$account'},0]}]},1,0]}},
          unowned:{$sum:{$cond:[{$or:[{$in:['$ownerType',['missing','null']]},{$eq:['$owner','']}]},1,0]}},
          orphaned:{$sum:{$cond:[{$and:[{$eq:['$ownerType','objectId']},{$eq:[{$size:'$account'},0]}]},1,0]}},
          invalidOwnerType:{$sum:{$cond:[{$and:[{$not:[{$in:['$ownerType',['missing','null','objectId']]}]},{$ne:['$owner','']}]},1,0]}}}},
        {$project:{_id:0}},
      ],{maxTimeMS:15000}).toArray();
      const indexes=await db.collection(collection).listIndexes().toArray().catch(error=>{if(error.code===26)return [];throw error;});
      result.push({collection,ownerKey,...(rows[0] || {total:0,owned:0,unowned:0,orphaned:0,invalidOwnerType:0}),indexes:indexes.map(i=>({name:i.name,key:i.key,unique:i.name==='_id_' || Boolean(i.unique)}))});
    }
    return result;
  } finally {await client.close();}
}
function report(collections,source) {
  return {mode:'dry-run-only',source,generatedAt:new Date().toISOString(),writes:0,ownershipAssignments:0,
    unresolvedOwnership:collections.reduce((n,c)=>n+c.unowned+c.orphaned+c.invalidOwnerType,0),collections,
    disposition:'Quarantine unresolved ownership. No account is assigned by default. Review evidence and a separate migration proposal before any backfill.',
    indexPlan:'Keep existing global unique indexes; scoped new singleton/fingerprint values do not collide with historic keys. Verify unique LifeContext.user_id and Memory.userId indexes before enabling context writes. No index is changed by this script.',
  };
}
async function main(args) {
  if(args.includes('--apply') || args.includes('--backfill')) throw new Error('M1 has no apply/backfill mode. Separate migration approval is required.');
  const value=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
  let data;
  if(value('--snapshot')) data=report(inventorySnapshot(JSON.parse(fs.readFileSync(value('--snapshot'),'utf8'))),'offline fixture/snapshot');
  else if(value('--uri-env') && args.includes('--read-only')) {
    const uri=process.env[value('--uri-env')];if(!uri)throw new Error('Read-only inventory connection is unavailable.');
    data=report(await inventoryDatabase(uri),'database metadata only');
  } else throw new Error('Use --snapshot FILE or --uri-env VARIABLE --read-only. URI values must not be supplied on the command line.');
  const output=JSON.stringify(data,null,2)+'\n';
  if(value('--output'))fs.writeFileSync(value('--output'),output);else process.stdout.write(output);
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error('M1 dry-run failed:',error.code || error.name || 'inventory error');process.exitCode=1;});
module.exports={COLLECTIONS,inventorySnapshot,inventoryDatabase,report,main};
