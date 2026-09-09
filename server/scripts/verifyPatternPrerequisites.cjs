// Read-only CLI. Deliberately does not load .env or use MONGO_URI.
const mongoose=require('mongoose');
const {INDEXES}=require('../services/patternEvidenceService');
async function verify(){
  if(!process.env.PATTERN_INDEX_URI)throw new Error('Set PATTERN_INDEX_URI explicitly. No default production connection is used.');
  await mongoose.connect(process.env.PATTERN_INDEX_URI,{autoIndex:false,autoCreate:false});
  try{
    const hello=await mongoose.connection.db.admin().command({hello:1});
    const transactionCapable=Boolean(hello.setName||hello.msg==='isdbgrid');
    const indexes=[];
    for(const spec of [...INDEXES,{model:'LifeContext',key:{user_id:1},unique:true},{model:'Memory',key:{userId:1},unique:true}]){
      const actual=await require('../models/'+spec.model).collection.indexes().catch(()=>[]);
      indexes.push({model:spec.model,key:spec.key,present:actual.some(i=>JSON.stringify(i.key)===JSON.stringify(spec.key)&&Boolean(i.unique)===Boolean(spec.unique))});
    }
    const session=await mongoose.startSession();let snapshotRead=false;
    try{session.startTransaction({readConcern:{level:'snapshot'}});await mongoose.connection.db.collection('lifecontexts').findOne({}, {session,projection:{_id:1}});snapshotRead=true;}finally{if(session.inTransaction())await session.abortTransaction();await session.endSession();}
    const result={database:mongoose.connection.name,transactionCapable,snapshotRead,indexes,ready:transactionCapable&&snapshotRead&&indexes.every(i=>i.present)};
    console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;
  }finally{await mongoose.disconnect();}
}
if(require.main===module)verify().catch(()=>{console.error('Pattern prerequisite check failed. Verify the explicit URI, transaction and metadata permissions.');process.exitCode=1;});
module.exports=verify;
