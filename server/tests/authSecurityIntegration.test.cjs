// Disposable database and mocked Google transport only. Never use MONGO_URI.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-security-integration-only';process.env.GOOGLE_CLIENT_ID='synthetic-client';process.env.ADMIN_EMAIL='reserved-admin@example.test';delete process.env.MONGO_URI;
const mongoose=require('mongoose'),bcrypt=require('bcryptjs'),express=require('express');
const {MongoMemoryReplSet}=require('mongodb-memory-server');
const {OAuth2Client}=require('google-auth-library');
const User=require('../models/User'),AuthSession=require('../models/AuthSession');
let db,server,base;const verified=new Map();const originalVerify=OAuth2Client.prototype.verifyIdToken;
OAuth2Client.prototype.verifyIdToken=async function({idToken,audience}){assert.equal(audience,process.env.GOOGLE_CLIENT_ID);assert(verified.has(idToken));return{getPayload:()=>verified.get(idToken)};};
const credential=(name,email,sub=name)=>{verified.set(name,{email,sub,email_verified:true,hd:'example.test',name});return name;};
const call=async(route,body,token)=>{const res=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const raw=await res.text();let data;try{data=JSON.parse(raw);}catch(_e){data={};}return{status:res.status,body:data};};
before(async()=>{
 db=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(db.getUri());await Promise.all([User.init(),AuthSession.init()]);
 const app=express();app.use(express.json());app.use('/auth',require('../routes/authRoutes'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{OAuth2Client.prototype.verifyIdToken=originalVerify;if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();});
test('real database enforces partial Google subject uniqueness while legacy records coexist',async()=>{
 const indexes=await User.collection.listIndexes().toArray();const idx=indexes.find(i=>i.key['identity.googleSubject']===1);assert.equal(idx.unique,true);assert(idx.partialFilterExpression);
 const common={name:'Fixture',password:await bcrypt.hash('known-password',10)};
 await User.create({...common,username:'legacy-one',email:'legacy-one@example.test'});await User.create({...common,username:'legacy-two',email:'legacy-two@example.test'});
 await User.create({...common,username:'linked-one',email:'linked-one@example.test',identity:{version:1,passwordEnabled:false,googleSubject:'unique-provider-subject'}});
 await assert.rejects(User.create({...common,username:'linked-two',email:'linked-two@example.test',identity:{version:1,passwordEnabled:false,googleSubject:'unique-provider-subject'}}),e=>e.code===11000);
});
test('real signup aliases cannot provision the reserved administrator',async()=>{
 for(const route of ['/auth/signup','/auth/register'])assert.equal((await call(route,{username:'forged-admin',email:' RESERVED-ADMIN@EXAMPLE.TEST ',password:'known-password'})).status,409);
 assert.equal(await User.countDocuments({email:process.env.ADMIN_EMAIL}),0);
});
test('reset flag cannot replace a real administrator password at startup or public login',async()=>{
 const password=await bcrypt.hash('known-password',10);const admin=await User.create({name:'Admin',username:'admin',email:process.env.ADMIN_EMAIL,password,role:'COMMANDER_IN_CHIEF',identity:{version:1,passwordEnabled:true}});
 process.env.RESET_ADMIN_PASSWORD='true';process.env.INITIAL_ADMIN_PASSWORD='unused-bootstrap-password';try{await require('../utils/adminIdentity').initializeAdminSystem();assert.equal((await User.findById(admin._id)).password,password);assert.equal(await AuthSession.countDocuments({userId:admin._id}),0);assert.equal((await call('/auth/login',{email:admin.email,password:'wrong-password'})).status,401);assert.equal((await User.findById(admin._id)).password,password);assert.equal(await AuthSession.countDocuments({userId:admin._id}),0);assert.equal((await call('/auth/login',{email:admin.email,password:'known-password'})).status,200);}finally{delete process.env.RESET_ADMIN_PASSWORD;delete process.env.INITIAL_ADMIN_PASSWORD;}
});
test('real new-account Google linking requires both proofs and preserves existing password and ownership',async()=>{
 const email='new-buyer@example.test';const signup=await call('/auth/signup',{username:'new-buyer',email,password:'known-password',role:'COMMANDER_IN_CHIEF'});assert.equal(signup.status,201);assert.equal(signup.body.role,'USER');const id=signup.body._id;
 const token=credential('buyer-google',email,'buyer-subject');assert.equal((await call('/auth/google',{credential:token})).status,409);assert.equal((await call('/auth/google',{credential:token,password:'wrong'})).status,409);
 const linked=await call('/auth/google',{credential:token,password:'known-password'});assert.equal(linked.status,200);assert.equal(linked.body._id,id);assert.equal((await User.findById(id)).identity.googleSubject,'buyer-subject');
 assert.equal((await call('/auth/google',{credential:token})).status,200);assert.equal((await call('/auth/login',{email,password:'known-password'})).status,200);
 const foreign=credential('other-google',email,'different-subject');assert.equal((await call('/auth/google',{credential:foreign,password:'known-password'})).status,401);
 const renamed=credential('renamed-google','new-address@example.test','buyer-subject');assert.equal((await call('/auth/google',{credential:renamed})).body._id,id);
});
test('concurrent different Google subjects never both link the same password account',async()=>{
 const email='race@example.test';await call('/auth/signup',{username:'race',email,password:'known-password'});
 const a=credential('race-a',email),b=credential('race-b',email);const results=await Promise.all([a,b].map(c=>call('/auth/google',{credential:c,password:'known-password'})));
 assert.equal(results.filter(r=>r.status===200).length,1);assert(results.some(r=>[401,409].includes(r.status)));const stored=await User.findOne({email});assert(['race-a','race-b'].includes(stored.identity.googleSubject));
});
test('legacy Google login requires explicit owner choice and preserves password access meanwhile',async()=>{
 const email='legacy-one@example.test';const result=await call('/auth/google',{credential:credential('legacy-google',email)});assert.equal(result.status,409);assert.equal(result.body.code,'LEGACY_ACCOUNT_UPGRADE_REQUIRED');assert.equal((await User.findOne({email})).identity,undefined);assert.equal((await call('/auth/login',{email,password:'known-password'})).status,200);
});
test('fresh Google signup persists subject-bound identity without enabling password login',async()=>{
 const email='google-only-new@example.test',token=credential('google-only-new',email);const result=await call('/auth/google',{credential:token});assert.equal(result.status,201);const user=await User.findById(result.body._id);assert.equal(user.identity.googleSubject,'google-only-new');assert.equal(user.identity.passwordEnabled,false);assert.equal(await AuthSession.countDocuments({userId:user._id}),1);assert.equal((await call('/auth/google',{credential:token})).status,200);
});

test('missing real Google index blocks Google identity writes but not password-only signup',async()=>{
 const indexes=await User.collection.listIndexes().toArray();const idx=indexes.find(i=>i.key['identity.googleSubject']===1);await User.collection.dropIndex(idx.name);
 try{
  const email='index-independent@example.test';const signup=await call('/auth/signup',{username:'index-independent',email,password:'known-password'});assert.equal(signup.status,201);
  const link=await call('/auth/google',{credential:credential('blocked-link',email),password:'known-password'});assert.equal(link.status,503);assert.equal((await User.findById(signup.body._id)).identity.googleSubject,undefined);assert.equal(await AuthSession.countDocuments({userId:signup.body._id}),1);
  const google=await call('/auth/google',{credential:credential('blocked-google','blocked-google@example.test')});assert.equal(google.status,503);assert.equal(await User.countDocuments({email:'blocked-google@example.test'}),0);
 }finally{await User.createIndexes();}
});

test('legacy Google-only recovery preserves account and rejects old password/session/refresh',async()=>{
 const email='legacy-secure@example.test',password=await bcrypt.hash('known-password',10);const user=await User.create({name:'Legacy secure',username:'legacy-secure',email,password});
 const stale=await User.findById(user._id);assert.equal(stale.authVersion,undefined);const old=await call('/auth/login',{email,password:'known-password'});assert.equal(old.status,200);assert.equal((await call('/auth/mfa/status',null,old.body.token)).status,200);
 const googleToken=credential('secure-legacy',email,'secure-subject');const prompt=await call('/auth/google',{credential:googleToken});assert.equal(prompt.status,409);assert.equal((await call('/auth/mfa/status',null,old.body.token)).status,200);
 const migrated=await call('/auth/google',{credential:googleToken,legacyUpgrade:'google-only',upgradeChallenge:prompt.body.upgradeChallenge});assert.equal(migrated.status,200);assert.equal(migrated.body._id,String(user._id));assert.equal((await User.findById(user._id)).password,password);assert.equal((await User.findById(user._id)).authVersion,1);stale.name='Concurrent profile update';await stale.save();assert.equal((await User.findById(user._id)).authVersion,1);assert.equal((await User.findById(user._id)).identity.googleSubject,'secure-subject');
 assert.equal((await call('/auth/mfa/status',null,old.body.token)).status,401);assert.equal((await call('/auth/refresh',{token:old.body.token})).status,401);assert.equal((await call('/auth/login',{email,password:'known-password'})).status,401);
 assert.equal((await call('/auth/mfa/status',null,migrated.body.token)).status,200);assert.equal((await call('/auth/refresh',{token:migrated.body.token})).status,200);assert.equal((await call('/auth/google',{credential:googleToken})).status,200);
 const scope={userId:String(user._id),sessionId:require('jsonwebtoken').verify(old.body.token,process.env.JWT_SECRET).sid};assert.equal(await require('../utils/sessionVersion').findCurrentSession(scope),null);
});

test('admin role reload cannot elevate an old password proof after concurrent legacy recovery',async()=>{
 const originalAdmin=process.env.ADMIN_EMAIL;const email='legacy-admin-race@example.test';process.env.ADMIN_EMAIL=email;
 const user=await User.create({name:'Race Admin',username:'legacy-admin-race',email,password:await bcrypt.hash('known-password',10),role:'USER'});
 const googleToken=credential('admin-race-google',email,'admin-race-subject');const prompt=await call('/auth/google',{credential:googleToken});assert.equal(prompt.status,409);
 const originalUpdate=User.collection.updateOne;let triggered=false,upgraded;
 User.collection.updateOne=async function(filter,update,...args){
  if(!triggered&&String(filter._id)===String(user._id)&&update.$set?.role==='COMMANDER_IN_CHIEF'){
   triggered=true;upgraded=await call('/auth/google',{credential:googleToken,legacyUpgrade:'google-only',upgradeChallenge:prompt.body.upgradeChallenge});
  }
  return originalUpdate.call(this,filter,update,...args);
 };
 try{const login=await call('/auth/login',{email,password:'known-password'});assert(triggered);assert.equal(upgraded.status,200);assert.equal(login.status,401);assert.equal(await AuthSession.countDocuments({userId:user._id}),1);assert.equal((await User.findById(user._id)).authVersion,1);}
 finally{User.collection.updateOne=originalUpdate;process.env.ADMIN_EMAIL=originalAdmin;}
});
