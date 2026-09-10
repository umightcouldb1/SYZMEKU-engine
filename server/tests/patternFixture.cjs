const path=require('node:path');
async function fixture({reasoning=false}={}){
  Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'pattern-disposable-fixture',CORE_CONTEXT_WRITES_ENABLED:'true',CORE_PATTERN_INTELLIGENCE_ENABLED:'true',CORE_PERSONAL_EXECUTION_ENABLED:'false',PATTERN_HYPOTHESIS_HMAC_KEY:'synthetic-pattern-key-with-at-least-32-characters',MONGOMS_DOWNLOAD_DIR:path.resolve(__dirname,'../../.cache/mongodb-binaries')});delete process.env.MONGO_URI;
  const mongoose=require('mongoose'),express=require('express'),jwt=require('jsonwebtoken');const {MongoMemoryReplSet}=require('mongodb-memory-server');
  const db=await MongoMemoryReplSet.create({replSet:{count:1,dbName:'pattern_fixtures'}});await mongoose.connect(db.getUri(),{autoIndex:false,autoCreate:false,monitorCommands:true});
  for(const name of ['LifeContext','Memory','Pattern','SignalEntry','Task'])await require('../models/'+name).createIndexes();
  const {runWithRequestContext}=require('../utils/requestContext');
  async function user(name,role='USER') {const u=await require('../models/User').create({name,username:name,email:name+'@example.test',password:'fixture-hash',role});const sid='pattern-'+name;await require('../models/AuthSession').create({userId:u._id,sessionId:sid,expiresAt:new Date(Date.now()+3600000)});return {id:String(u._id),sid,token:jwt.sign({id:String(u._id),sid},process.env.JWT_SECRET)};}
  const founder=await user('pattern-founder','COMMANDER_IN_CHIEF'),other=await user('pattern-other');process.env.CORE_CONTEXT_WRITE_USER_IDS=founder.id;process.env.CORE_PATTERN_USER_IDS=founder.id;
  const scope=(u,fn)=>runWithRequestContext({authenticated:true,userId:u.id,sessionId:u.sid},fn);
  const app=express();app.use(express.json());app.use('/api/core/analyze',require('../routes/memoryAnalyzeRoutes'));app.use('/api/core/patterns',require('../routes/patternRoutes'));app.use('/api/core',require('../routes/coreContextRoutes'));app.use('/api/core',require('../routes/API/coreRoutes'));app.use('/api/memory',require('../routes/memoryRoutes'));
  if(reasoning){
    process.env.CORE_REASONING_RECONCILIATION_ENABLED='true';process.env.CORE_REASONING_USER_IDS=founder.id;
    await require('../models/ReasoningRecord').createIndexes();
    // Use production route order, not an approximation that can hide shadowing.
    app._router.stack.splice(3);
    app.use('/api',require('../routes'));
  }
  app.use((err,_req,res,_next)=>res.status(err.statusCode||(res.statusCode>=400?res.statusCode:500)).json({message:err.message,code:err.code}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  async function request(u,route,method='GET',body,headers={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+u.token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
  const close=async()=>{await new Promise(r=>server.close(r));await mongoose.disconnect();await db.stop();};
  return {mongoose,app,server,base,scope,founder,other,user,request,close};
}
module.exports=fixture;
