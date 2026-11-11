const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../controllers/auth controller.js'),'utf8');
const adminEmail='admin@example.test',hash=value=>`synthetic-hash:${value}`;
const passwordUser=extra=>({_id:'buyer-id',email:'buyer@example.test',username:'buyer',name:'Buyer',password:hash('known-password'),role:'USER',identity:{version:1,passwordEnabled:true},...extra});
function fixture(initial=[],options={}){
 const users=initial.map(u=>({...u,save:async function(){return this;}})),sessions=[],audits=[],updates=[];
 let google={sub:'google-subject-1',email:'buyer@example.test',email_verified:true,hd:'example.test',name:'Buyer'};
 const User={ROLES:{USER:'USER',COMMANDER_IN_CHIEF:'COMMANDER_IN_CHIEF'},
  findOne:async filter=>users.find(u=>u.identity?.googleSubject===filter['identity.googleSubject'])||null,
  create:async data=>{if(options.duplicateCreate)throw Object.assign(Error('duplicate'),{code:11000});const u={_id:`user-${users.length+1}`,...data,save:async function(){return this;}};users.push(u);return u;},
  findOneAndUpdate:async(filter,update)=>{updates.push({filter,update});options.beforeLink?.(users);if(filter.identity){const u=users.find(u=>u._id===filter._id&&u.password===filter.password&&u.identity===undefined&&(u.authVersion||0)===(filter.authVersion||0));if(!u)return null;if(options.duplicateLink)throw Object.assign(Error('duplicate'),{code:11000});u.identity=update.$set.identity;u.authVersion=(u.authVersion||0)+update.$inc.authVersion;return u;}const u=users.find(u=>u._id===filter._id&&u.password===filter.password&&u.identity?.version===1&&u.identity?.passwordEnabled===true&&!Object.hasOwn(u.identity,'googleSubject'));if(!u)return null;if(options.duplicateLink)throw Object.assign(Error('duplicate'),{code:11000});u.identity.googleSubject=update.$set['identity.googleSubject'];u.identity.emailVerifiedAt=update.$set['identity.emailVerifiedAt'];return u;}
 };
 const deps={crypto:{randomUUID:()=>`session-${sessions.length}`},'../models/User':User,'../models/AuthSession':{create:async v=>{sessions.push(v);return v;}},bcryptjs:{genSalt:async()=>'unused',hash:async v=>hash(v),compare:async(v,s)=>hash(v)===s},jsonwebtoken:require('jsonwebtoken'),'google-auth-library':{OAuth2Client:class{async verifyIdToken(){return{getPayload:()=>google};}}},'../utils/audit':{logAuditEvent:async v=>audits.push(v)},'../utils/jwtSecret':{getJwtSecret:()=>'synthetic-only'},'../utils/sessionVersion':require('../utils/sessionVersion'),'../utils/identityIndex':{ensureIdentityIndex:async()=>{if(options.indexUnavailable)throw Object.assign(Error('Enrollment unavailable'),{code:'AUTH_IDENTITY_INDEX_UNAVAILABLE',statusCode:503});}},'../utils/adminIdentity':{normalizeEmail:e=>String(e||'').trim().toLowerCase(),deriveUsernameFromEmail:e=>e.split('@')[0],isAdminEmail:e=>e===adminEmail,findUserByEmail:async e=>users.find(u=>u.email===e)||null,ensureAdminRoleForUser:async u=>options.ensureAdmin?options.ensureAdmin(u):u,resolveUniqueUsername:async n=>n}};
 const context={module:{exports:{}},require:id=>{assert(Object.hasOwn(deps,id),`unexpected dependency ${id}`);return deps[id];},process:{env:{GOOGLE_CLIENT_ID:'synthetic-client-id',...options.env}},console:{log(){},error(){},warn(){}},Date};vm.runInNewContext(source,context);
 return{users,sessions,audits,updates,setGoogle:value=>{google={...google,...value};},call:async(method,body)=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},cookie(){},json(v){this.body=v;return this;}};await context.module.exports[method]({body,headers:{}},res);return res;}};
}
const upgrade=async(f,body)=>{const prompt=await f.call('googleLoginUser',{credential:body.credential});return f.call('googleLoginUser',{...body,upgradeChallenge:prompt.body.upgradeChallenge});};
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
test('legacy password login remains available but Google requires explicit security upgrade',async()=>{
 const old=passwordUser();delete old.identity;const f=fixture([old]);assert.equal((await f.call('loginUser',{email:old.email,password:'known-password'})).statusCode,200);const r=await f.call('googleLoginUser',{credential:'synthetic'});assert.equal(r.statusCode,409);assert.equal(r.body.code,'LEGACY_ACCOUNT_UPGRADE_REQUIRED');assert.equal(f.sessions.length,1);assert.equal(f.users[0].identity,undefined);assert.equal(f.users[0].password,old.password);
});
test('explicit legacy password link needs both proofs and invalidates only old session versions',async()=>{
 const old=passwordUser();delete old.identity;const f=fixture([old]);assert.equal((await upgrade(f,{credential:'synthetic',legacyUpgrade:'link-password',password:'wrong'})).statusCode,409);assert.equal(f.sessions.length,0);assert.equal(f.users[0].identity,undefined);
 assert.equal((await upgrade(f,{credential:'synthetic',legacyUpgrade:'link-password',password:'known-password'})).statusCode,200);assert.equal(f.users[0].identity.passwordEnabled,true);assert.equal(f.users[0].identity.googleSubject,'google-subject-1');assert.equal(f.users[0].authVersion,1);assert.equal(f.sessions[0].authVersion,1);assert.equal(f.users[0].password,old.password);assert.equal((await f.call('loginUser',{email:old.email,password:'known-password'})).statusCode,200);
});
test('explicit Google-only legacy recovery disables old password without deleting data',async()=>{
 const old=passwordUser({purchasedProducts:['preserved']});delete old.identity;const f=fixture([old]);assert.equal((await upgrade(f,{credential:'synthetic',legacyUpgrade:'google-only'})).statusCode,200);assert.equal(f.users[0].identity.passwordEnabled,false);assert.equal(f.users[0].authVersion,1);assert.equal(f.users[0].password,old.password);assert.deepEqual(f.users[0].purchasedProducts,['preserved']);assert.equal((await f.call('loginUser',{email:old.email,password:'known-password'})).statusCode,401);assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,200);assert.equal(f.users[0].authVersion,1);
});
test('legacy recovery cannot apply after concurrent identity or password change',async()=>{
 for(const options of [{beforeLink:users=>{users[0].password=hash('changed');}},{beforeLink:users=>{users[0].identity={version:1,passwordEnabled:true,googleSubject:'other'};}},{duplicateLink:true}]){const old=passwordUser();delete old.identity;const f=fixture([old],options);assert.equal((await upgrade(f,{credential:'synthetic',legacyUpgrade:'google-only'})).statusCode,409);assert.equal(f.sessions.length,0);}
});
test('null, malformed and unsupported identity metadata fail closed',async()=>{
 for(const identity of [null,{version:2,passwordEnabled:true},{version:1}]){const f=fixture([passwordUser({identity})]);assert.equal((await f.call('loginUser',{email:'buyer@example.test',password:'known-password'})).statusCode,503);assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,503);assert.equal(f.sessions.length,0);}
});
test('Google verified email is still required',async()=>{const f=fixture();f.setGoogle({email_verified:false});assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,401);assert.equal(f.users.length,0);assert.equal(f.sessions.length,0);});
test('schema leaves legacy identity absent and declares partial subject uniqueness',()=>{
 const User=require('../models/User'),user=new User({name:'Legacy',username:'legacy',email:'legacy@example.test',password:'fixture'});assert.equal(user.identity,undefined);assert.equal(user.toObject().identity,undefined);const index=User.schema.indexes().find(([keys])=>keys['identity.googleSubject']===1);assert(index);assert.equal(index[1].unique,true);assert.deepEqual(index[1].partialFilterExpression,{'identity.googleSubject':{$type:'string',$gt:''}});
});
test('bootstrap marks only fresh administrators and ignores reset flags for existing credentials',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../utils/adminIdentity.js'),'utf8');
 for(const mode of ['fresh','legacy','password','google'])for(const reset of [false,true]){
  let stored=mode==='fresh'?null:passwordUser({email:adminEmail,role:'COMMANDER_IN_CHIEF',...(mode==='google'?{identity:{version:1,passwordEnabled:false,googleSubject:'existing-subject'}}:{})});
  if(mode==='legacy')delete stored.identity;
  const before=stored?JSON.parse(JSON.stringify(stored)):null,hashCalls=[];
  if(stored)stored.save=async()=>stored;
  const query=v=>({then:(a,b)=>Promise.resolve(v).then(a,b),select:async()=>v});
  const User={ROLES:{COMMANDER_IN_CHIEF:'COMMANDER_IN_CHIEF'},findOne:f=>query(f.username?null:stored),create:async v=>{stored={_id:'admin-id',...v,save:async()=>stored};return stored;},findById:async()=>stored,collection:{updateOne:async()=>{}}};
  const sandbox={module:{exports:{}},require:id=>id==='bcryptjs'?{hash:async v=>{hashCalls.push(v);return hash(v);}}:User,process:{env:{ADMIN_EMAIL:adminEmail,INITIAL_ADMIN_PASSWORD:'configured-bootstrap-password',...(reset?{RESET_ADMIN_PASSWORD:'true'}:{})}},console:{log(){},warn(){},error(){}}};
  vm.runInNewContext(src,sandbox);await sandbox.module.exports.initializeAdminSystem();assert(stored);
  if(mode==='fresh'){
   assert.equal(stored.password,hash('configured-bootstrap-password'));assert.equal(stored.identity.version,1);assert.equal(stored.identity.passwordEnabled,true);assert.equal(hashCalls.length,1);
  }else{
   assert.equal(stored.password,before.password);assert.equal(hashCalls.length,0);assert.deepEqual(stored.identity,before.identity);assert.equal(stored._id,before._id);
  }
 }
});

test('password signup remains available without the Google identity index',async()=>{
 const signup=fixture([],{indexUnavailable:true});assert.equal((await signup.call('registerUser',{username:'new',email:'new@example.test',password:'known-password'})).statusCode,201);assert.equal(signup.users.length,1);assert.equal(signup.sessions.length,1);assert.equal(signup.users[0].identity.version,1);assert.equal(signup.users[0].role,'USER');
});

test('React Google-link cancellation is disabled while an authentication request is pending',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../client/src/AuthPage.jsx'),'utf8');
 assert.match(src,/<button type="button" disabled=\{isLoading\} onClick=\{\(\) => \{\s*if \(isLoading \|\| googlePendingRef.current\) return;[\s\S]*?Cancel Google linking<\/button>/);
});

test('missing identity index blocks new Google enrollment/linking without changing legacy login',async()=>{
 const google=fixture([],{indexUnavailable:true});assert.equal((await google.call('googleLoginUser',{credential:'synthetic'})).statusCode,503);assert.equal(google.users.length,0);
 const link=fixture([passwordUser()],{indexUnavailable:true});assert.equal((await link.call('googleLoginUser',{credential:'synthetic',password:'known-password'})).statusCode,503);assert.equal(link.updates.length,0);assert.equal(link.sessions.length,0);
 const old=passwordUser();delete old.identity;const legacy=fixture([old],{indexUnavailable:true});assert.equal((await legacy.call('googleLoginUser',{credential:'synthetic'})).statusCode,409);assert.equal((await upgrade(legacy,{credential:'synthetic',legacyUpgrade:'google-only'})).statusCode,503);assert.equal((await legacy.call('loginUser',{email:old.email,password:'known-password'})).statusCode,200);
});

test('legacy confirmation is short-lived and bound to verified Google subject and account',async()=>{
 const old=passwordUser();delete old.identity;const f=fixture([old]);const prompt=await f.call('googleLoginUser',{credential:'synthetic'});assert(prompt.body.upgradeChallenge);
 assert.equal((await f.call('googleLoginUser',{credential:'synthetic',legacyUpgrade:'google-only'})).statusCode,409);
 f.setGoogle({sub:'different-google-subject'});assert.equal((await f.call('googleLoginUser',{credential:'synthetic',legacyUpgrade:'google-only',upgradeChallenge:prompt.body.upgradeChallenge})).statusCode,409);assert.equal(f.users[0].identity,undefined);assert.equal(f.sessions.length,0);
 const expired=require('jsonwebtoken').sign({purpose:'legacy-identity-upgrade',uid:'buyer-id',sub:'different-google-subject',av:0},'synthetic-only',{issuer:'syzmeku-identity-upgrade',expiresIn:-1});assert.equal((await f.call('googleLoginUser',{credential:'synthetic',legacyUpgrade:'google-only',upgradeChallenge:expired})).statusCode,409);assert.equal(f.sessions.length,0);
});

test('third-party Google email cannot authorize Google-only legacy recovery',async()=>{
 const old=passwordUser();delete old.identity;const f=fixture([old]);f.setGoogle({hd:undefined});const prompt=await f.call('googleLoginUser',{credential:'synthetic'});assert.equal(prompt.body.googleRecoveryAvailable,false);const r=await f.call('googleLoginUser',{credential:'synthetic',legacyUpgrade:'google-only',upgradeChallenge:prompt.body.upgradeChallenge});assert.equal(r.statusCode,409);assert.equal(f.users[0].identity,undefined);assert.equal(f.sessions.length,0);assert.equal(f.users[0].password,old.password);
 assert.equal((await upgrade(f,{credential:'synthetic',legacyUpgrade:'link-password',password:'known-password'})).statusCode,200);
});
test('Gmail or verified Workspace claim enables offered Google recovery, not a caller assertion',async()=>{
 for(const [email,hd,allowed] of [['person@gmail.com',undefined,true],['person@example.test','example.test',true],['person@alias.test','primary.test',true],['person@notgmail.com',undefined,false]]){const old=passwordUser({email});delete old.identity;const f=fixture([old]);f.setGoogle({email,hd});const r=await f.call('googleLoginUser',{credential:'synthetic',googleRecoveryAvailable:true});assert.equal(r.body.googleRecoveryAvailable,allowed);assert.equal(f.users[0].identity,undefined);}
});

test('admin role refresh cannot upgrade a stale password proof into a recovered session epoch',async()=>{
 const f=fixture([passwordUser({email:adminEmail,role:'USER'})],{ensureAdmin:u=>({...u,role:'COMMANDER_IN_CHIEF',authVersion:1,identity:{version:1,passwordEnabled:false,googleSubject:'recovered'}})});assert.equal((await f.call('loginUser',{email:adminEmail,password:'known-password'})).statusCode,401);assert.equal(f.sessions.length,0);
});

test('missing reserved administrator cannot be created from non-authoritative Google email',async()=>{
 const f=fixture();f.setGoogle({email:adminEmail,hd:undefined});assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,403);assert.equal(f.users.length,0);assert.equal(f.sessions.length,0);
 f.setGoogle({hd:'example.test'});assert.equal((await f.call('googleLoginUser',{credential:'synthetic'})).statusCode,201);assert.equal(f.users[0].role,'COMMANDER_IN_CHIEF');
});

test('unchanged Google button size does not recreate the active identity button on resize callbacks',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../client/src/AuthPage.jsx'),'utf8');const start=src.indexOf('    const drawGoogleButton =');const end=src.indexOf('    const renderGoogleButton =',start);let width=600,renders=0;const host={childElementCount:0,getBoundingClientRect:()=>({width}),innerHTML:''};const sandbox={googleButtonRef:{current:host},googleRenderedRef:{current:null},googleClientId:'synthetic',onGoogleSuccess(){},isSignup:false};const draw=vm.runInNewContext(`(()=>{${src.slice(start,end)};return drawGoogleButton;})()`,sandbox);const google={accounts:{id:{initialize(){},renderButton(){renders++;host.childElementCount=1;}}}};assert(draw(google));assert(draw(google));width=500;assert(draw(google));assert.equal(renders,1);width=300;assert(draw(google));assert.equal(renders,2);
});
