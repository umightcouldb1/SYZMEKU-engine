const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../controllers/auth controller.js'),'utf8');
const adminEmail='admin@example.test',hash=value=>`synthetic-hash:${value}`;
const passwordUser=extra=>({_id:'buyer-id',email:'buyer@example.test',username:'buyer',name:'Buyer',password:hash('known-password'),role:'USER',identity:{version:1,passwordEnabled:true},...extra});
function fixture(initial=[],options={}){
 const users=initial.map(u=>({...u,save:async function(){return this;}})),sessions=[],audits=[],updates=[];
 let google={sub:'google-subject-1',email:'buyer@example.test',email_verified:true,name:'Buyer'};
 const User={ROLES:{USER:'USER',COMMANDER_IN_CHIEF:'COMMANDER_IN_CHIEF'},
  findOne:async filter=>users.find(u=>u.identity?.googleSubject===filter['identity.googleSubject'])||null,
  create:async data=>{if(options.duplicateCreate)throw Object.assign(Error('duplicate'),{code:11000});const u={_id:`user-${users.length+1}`,...data,save:async function(){return this;}};users.push(u);return u;},
  findOneAndUpdate:async(filter,update)=>{updates.push({filter,update});options.beforeLink?.(users);const u=users.find(u=>u._id===filter._id&&u.password===filter.password&&u.identity?.version===1&&u.identity?.passwordEnabled===true&&!Object.hasOwn(u.identity,'googleSubject'));if(!u)return null;if(options.duplicateLink)throw Object.assign(Error('duplicate'),{code:11000});u.identity.googleSubject=update.$set['identity.googleSubject'];u.identity.emailVerifiedAt=update.$set['identity.emailVerifiedAt'];return u;}
 };
 const deps={crypto:{randomUUID:()=>`session-${sessions.length}`},'../models/User':User,'../models/AuthSession':{create:async v=>{sessions.push(v);return v;}},bcryptjs:{genSalt:async()=>'unused',hash:async v=>hash(v),compare:async(v,s)=>hash(v)===s},jsonwebtoken:{sign:()=>'synthetic-app-token'},'google-auth-library':{OAuth2Client:class{async verifyIdToken(){return{getPayload:()=>google};}}},'../utils/audit':{logAuditEvent:async v=>audits.push(v)},'../utils/jwtSecret':{getJwtSecret:()=>'synthetic-only'},'../utils/adminIdentity':{normalizeEmail:e=>String(e||'').trim().toLowerCase(),deriveUsernameFromEmail:e=>e.split('@')[0],isAdminEmail:e=>e===adminEmail,findUserByEmail:async e=>users.find(u=>u.email===e)||null,ensureAdminRoleForUser:async u=>u,resolveUniqueUsername:async n=>n}};
 const context={module:{exports:{}},require:id=>{assert(Object.hasOwn(deps,id),`unexpected dependency ${id}`);return deps[id];},process:{env:{GOOGLE_CLIENT_ID:'synthetic-client-id',...options.env}},console:{log(){},error(){},warn(){}},Date};vm.runInNewContext(source,context);
 return{users,sessions,audits,updates,setGoogle:value=>{google={...google,...value};},call:async(method,body)=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},cookie(){},json(v){this.body=v;return this;}};await context.module.exports[method]({body,headers:{}},res);return res;}};
}
test('reset flag never authorizes wrong administrator password, creates admin or changes hash',async()=>{
 for(const exists of [true,false]){const f=fixture(exists?[passwordUser({email:adminEmail,role:'COMMANDER_IN_CHIEF'})]:[],{env:{RESET_ADMIN_PASSWORD:'true'}});assert.equal((await f.call('loginUser',{email:adminEmail,password:'wrong'})).statusCode,401);assert.equal(f.sessions.length,0);assert.equal(f.users.length,exists?1:0);if(exists)assert.equal(f.users[0].password,hash('known-password'));}
});
test('existing administrator correct-password login remains available with reset flag',async()=>{
 const f=fixture([passwordUser({email:adminEmail,role:'COMMANDER_IN_CHIEF'})],{env:{RESET_ADMIN_PASSWORD:'true'}});const r=await f.call('loginUser',{email:adminEmail,password:'known-password'});assert.equal(r.statusCode,200);assert.equal(r.body.role,'COMMANDER_IN_CHIEF');assert.equal(f.sessions.length,1);
});
test('reserved admin signup is refused; normal signup ignores caller role and identity',async()=>{
 const f=fixture();assert.equal((await f.call('registerUser',{username:'x',email:' ADMIN@EXAMPLE.TEST ',password:'known-password'})).statusCode,409);assert.equal(f.users.length,0);assert.equal(f.sessions.length,0);const r=await f.call('registerUser',{username:'buyer',email:'buyer@example.test',password:'known-password',role:'COMMANDER_IN_CHIEF',identity:{googleSubject:'forged'}});assert.equal(r.statusCode,201);assert.equal(f.users[0].role,'USER');assert.deepEqual(JSON.parse(JSON.stringify(f.users[0].identity)),{version:1,passwordEnabled:true});
});
test('signup and register aliases share the hardened handler',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../routes/API/authRoutes.js'),'utf8');assert.match(s,/post\('\/signup', asyncHandler\(registerUser\)\)/);assert.match(s,/post\('\/register', asyncHandler\(registerUser\)\)/);
});
test('unverified password account never silently merges on Google proof or wrong password',async()=>{
 const f=fixture([passwordUser()]);for(const password of [undefined,'wrong']){const r=await f.call('googleLoginUser',{credential:'synthetic',password});assert.equal(r.statusCode,409);assert.equal(r.body.code,'GOOGLE_ACCOUNT_LINK_REQUIRED');}assert.equal(f.sessions.length,0);assert.equal(f.updates.length,0);assert.equal(f.users[0].identity.googleSubject,undefined);
});
test('both proofs link atomically and exact linked subject subsequently needs no password',async()=>{
 const f=fixture([passwordUser({purchasedProducts:['unchanged-fixture']})]);assert.equal((await f.call('googleLoginUser',{credential:'synthetic',password:'known-password'})).statusCode,200);assert.equal(f.users[0].identity.googleSubject,'google-subject-1');assert.equal(f.updates.length,1);assert.equal(f.updates[0].filter.password,hash('known-password'));assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,200);assert.deepEqual(f.users[0].purchasedProducts,['unchanged-fixture']);assert.equal(f.users[0].password,hash('known-password'));
});
test('subject binding rejects replacement and preserves account ownership across Google email change',async()=>{
 const f=fixture([passwordUser({identity:{version:1,passwordEnabled:true,googleSubject:'google-subject-1'}})]);f.setGoogle({sub:'other'});assert.equal((await f.call('googleLoginUser',{credential:'synthetic',password:'known-password'})).statusCode,401);assert.equal(f.sessions.length,0);f.setGoogle({sub:'google-subject-1',email:'changed@example.test'});const r=await f.call('googleLoginUser',{credential:'synthetic'});assert.equal(r.statusCode,200);assert.equal(r.body._id,'buyer-id');assert.equal(f.users.length,1);assert.equal(f.users[0].email,'buyer@example.test');
});
test('new Google account binds subject and does not enable password credential',async()=>{
 const f=fixture();assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,201);assert.equal(f.users[0].identity.passwordEnabled,false);assert.equal(f.users[0].identity.googleSubject,'google-subject-1');assert(f.users[0].identity.emailVerifiedAt);
});
test('concurrent link/password changes and duplicate identities cannot mint stale sessions',async()=>{
 for(const options of [{beforeLink:users=>{users[0].password=hash('changed');}},{beforeLink:users=>{users[0].identity.googleSubject='other';}},{duplicateLink:true}]){const f=fixture([passwordUser()],options);assert.equal((await f.call('googleLoginUser',{credential:'synthetic',password:'known-password'})).statusCode,409);assert.equal(f.sessions.length,0);}const f=fixture([],{duplicateCreate:true});assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,409);assert.equal(f.sessions.length,0);
});
test('legacy password and Google access persist without inventing identity provenance',async()=>{
 const old=passwordUser();delete old.identity;const f=fixture([old]);assert.equal((await f.call('loginUser',{email:old.email,password:'known-password'})).statusCode,200);assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,200);assert.equal(f.users[0].identity,undefined);assert.equal(f.users[0].password,old.password);
});
test('null, malformed and unsupported identity metadata fail closed',async()=>{
 for(const identity of [null,{version:2,passwordEnabled:true},{version:1}]){const f=fixture([passwordUser({identity})]);assert.equal((await f.call('loginUser',{email:'buyer@example.test',password:'known-password'})).statusCode,503);assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,503);assert.equal(f.sessions.length,0);}
});
test('Google verified email is still required',async()=>{const f=fixture();f.setGoogle({email_verified:false});assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,401);assert.equal(f.users.length,0);assert.equal(f.sessions.length,0);});
test('schema leaves legacy identity absent and declares partial subject uniqueness',()=>{
 const User=require('../models/User'),user=new User({name:'Legacy',username:'legacy',email:'legacy@example.test',password:'fixture'});assert.equal(user.identity,undefined);assert.equal(user.toObject().identity,undefined);const index=User.schema.indexes().find(([keys])=>keys['identity.googleSubject']===1);assert(index);assert.equal(index[1].unique,true);assert.deepEqual(index[1].partialFilterExpression,{'identity.googleSubject':{$type:'string',$gt:''}});
});
test('bootstrap marks only fresh administrators and explicit reset restores password without relabeling legacy',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../utils/adminIdentity.js'),'utf8');for(const mode of ['fresh','legacy-reset','google-reset']){let stored=mode==='fresh'?null:passwordUser({email:adminEmail,role:'COMMANDER_IN_CHIEF',...(mode==='google-reset'?{identity:{version:1,passwordEnabled:false,googleSubject:'existing-subject'}}:{})});if(mode==='legacy-reset')delete stored.identity;if(stored)stored.save=async()=>stored;const query=v=>({then:(a,b)=>Promise.resolve(v).then(a,b),select:async()=>v});const User={ROLES:{COMMANDER_IN_CHIEF:'COMMANDER_IN_CHIEF'},findOne:f=>query(f.username?null:stored),create:async v=>{stored={_id:'admin-id',...v,save:async()=>stored};return stored;},findById:async()=>stored,collection:{updateOne:async()=>{}}};const sandbox={module:{exports:{}},require:id=>id==='bcryptjs'?{hash:async v=>hash(v)}:User,process:{env:{ADMIN_EMAIL:adminEmail,INITIAL_ADMIN_PASSWORD:'configured-recovery-password',...(mode==='fresh'?{}:{RESET_ADMIN_PASSWORD:'true'})}},console:{log(){},warn(){},error(){}}};vm.runInNewContext(src,sandbox);await sandbox.module.exports.initializeAdminSystem();assert(stored);assert.equal(stored.password,hash('configured-recovery-password'));if(mode==='legacy-reset')assert.equal(stored.identity,undefined);else{assert.equal(stored.identity.version,1);assert.equal(stored.identity.passwordEnabled,true);}if(mode==='google-reset')assert.equal(stored.identity.googleSubject,'existing-subject');}
});
