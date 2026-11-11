const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].replaceAll('__FREEDOM_AUDIT_GOOGLE_CLIENT_ID__','994975817231-obs40351opa36ljffmelqb4o3vtru044.apps.googleusercontent.com');
function page(respond){
 const elements=new Map();const stored=new Map();const requests=[];let callback;
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,children:[],classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,yes)=>yes?classes.add(x):classes.delete(x)},setAttribute(){},addEventListener(){},appendChild(child){this.children.push(child)},remove(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const sandbox={console,URLSearchParams,setTimeout,clearTimeout,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},document:{getElementById:get,createElement:element,head:element()},window:{location:{search:''},scrollTo(){},google:{accounts:{id:{initialize:o=>{callback=o.callback},renderButton(){}}}}},fetch:async(url,options)=>{requests.push({url,options});const reply=await respond(url,options);return {ok:reply.status<400,status:reply.status,json:async()=>reply.body};}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {requests,stored,get,run:code=>vm.runInContext(code,sandbox),google:async response=>{await vm.runInContext('initializeGoogleSignIn()',sandbox);return callback(response)},sandbox};
}
test('Google new-account response creates app session but never grants unpaid access',async()=>{
 const p=page(async(url)=>url.endsWith('/auth/google')?{status:201,body:{token:'new-app-session'}}:{status:200,body:{entitled:false}});
 await p.google({credential:'synthetic-google-credential'});
 assert.equal(p.stored.get('freedomAuditToken'),'new-app-session');assert.equal(p.run('state.entitled'),false);
 assert.deepEqual(JSON.parse(p.requests[0].options.body),{credential:'synthetic-google-credential'});
 assert.equal(p.requests[1].options.headers.Authorization,'Bearer new-app-session');assert.equal(p.run('state.authBusy'),false);
});
test('existing Google account resumes server-verified paid access and saved result',async()=>{
 const p=page(async(url)=>url.endsWith('/auth/google')?{status:200,body:{token:'existing-session'}}:{status:200,body:{entitled:true,latestResult:{score:80}}});
 await p.google({credential:'synthetic-credential'});assert.equal(p.run('state.entitled'),true);assert.equal(p.run('state.latestResult.score'),80);assert.equal(p.get('audit').classList.contains('hidden'),false);
});
test('missing or rejected Google credential never stores a session and controls recover',async()=>{
 const p=page(async()=>({status:401,body:{message:'Google authentication failed'}}));
 await p.google({});assert.equal(p.requests.length,0);
 await p.google({credential:'rejected'});assert.equal(p.stored.size,0);assert.equal(p.run('state.entitled'),false);assert.equal(p.get('authSubmit').disabled,false);assert.match(p.get('gateMessage').innerHTML,/Google authentication failed/);
});
test('auth request serialization prevents duplicate session exchanges',async()=>{
 let release;const pending=new Promise(r=>release=r);const p=page(async(url)=>{if(url.endsWith('/auth/google')){await pending;return {status:200,body:{token:'one-session'}}}return {status:200,body:{entitled:false}}});
 const first=p.google({credential:'first'});await new Promise(r=>setImmediate(r));await p.google({credential:'duplicate'});release();await first;
 assert.equal(p.requests.filter(r=>r.url.endsWith('/auth/google')).length,1);
});
test('switching identities clears stale paid entitlement and result if refresh fails',async()=>{
 const p=page(async(url)=>url.endsWith('/auth/google')?{status:200,body:{token:'second-session'}}:{status:503,body:{message:'temporarily unavailable'}});
 p.run('state.entitled=true;state.latestResult={privateResult:true}');await p.google({credential:'second'});
 assert.equal(p.run('state.entitled'),false);assert.equal(p.run('state.latestResult'),null);
});
test('stale entitlement response cannot overwrite a newer identity',async()=>{
 let release;const p=page(()=>new Promise(r=>release=r));p.run("state.token='old-session'");const pending=p.run('refreshEntitlement()');p.run("state.token='new-session'");release({status:200,body:{entitled:true,latestResult:{private:true}}});await pending;
 assert.equal(p.run('state.entitled'),false);assert.equal(p.run('state.latestResult'),null);
});
test('provider load failure is recoverable and password login stays available',async()=>{
 const p=page(async()=>({status:200,body:{entitled:false}}));delete p.sandbox.window.google;p.sandbox.document.head.appendChild=script=>script.onerror();
 await p.run('initializeGoogleSignIn()');assert.match(p.get('googleStatus').textContent,/could not load/);assert.equal(p.get('googleRetry').classList.contains('hidden'),false);assert.equal(p.get('authSubmit').disabled,false);
});
test('email/password sign-in uses the same session completion and entitlement refresh',async()=>{
 const p=page(async(url)=>url.endsWith('/auth/login')?{status:200,body:{token:'password-session'}}:{status:200,body:{entitled:false}});p.get('email').value='fixture@example.test';p.get('password').value='fixture-only';
 await p.run('submitAuth({preventDefault(){}})');assert.equal(p.stored.get('freedomAuditToken'),'password-session');assert.equal(p.requests[1].options.headers.Authorization,'Bearer password-session');
});
test('generation serializes submits, preserves answers on failure, and recovers controls',async()=>{
 let release;const p=page(()=>new Promise(r=>release=r));p.sandbox.document.querySelector=()=>({value:'3'});p.get('win').value='My saved draft';p.run("state.token='buyer'");
 const first=p.run('submitAudit({preventDefault(){}})');await p.run('submitAudit({preventDefault(){}})');assert.equal(p.requests.length,1);assert.equal(p.get('generateButton').disabled,true);
 release({status:503,body:{error:'No new result was saved. Please retry.'}});await first;
 assert.equal(p.get('win').value,'My saved draft');assert.equal(p.get('generateButton').disabled,false);assert.match(p.get('auditError').innerHTML,/retry/);
});
test('expired generation session displays recovery in the visible sign-in panel',async()=>{
 const p=page(async()=>({status:401,body:{error:'Session expired'}}));p.sandbox.document.querySelector=()=>({value:'3'});
 await p.run('submitAudit({preventDefault(){}})');assert.equal(p.get('gate').classList.contains('hidden'),false);assert.match(p.get('gateMessage').innerHTML,/sign in and verify/);
});
test('switching identity during generation never displays the previous buyer result',async()=>{
 let release;const p=page(()=>new Promise(r=>release=r));p.sandbox.document.querySelector=()=>({value:'3'});p.run("state.token='old'");const pending=p.run('submitAudit({preventDefault(){}})');p.run("state.token='new'");release({status:201,body:{result:{private:true}}});await pending;assert.equal(p.run('state.latestResult'),null);
});
test('Google linking requests explicit password retry without persisting provider credential or password',async()=>{
 let calls=0;const p=page(async(url)=>{if(url.endsWith('/auth/google')){calls++;return calls===1?{status:409,body:{code:'GOOGLE_ACCOUNT_LINK_REQUIRED',message:'Enter account password and choose Google again.'}}:{status:200,body:{token:'linked-app-session'}};}return {status:200,body:{entitled:false}};});
 p.get('password').value='existing-password';await p.google({credential:'first-provider-credential'});assert.equal(p.run('state.googleLinkRequired'),true);assert.equal(p.stored.size,0);assert.deepEqual(JSON.parse(p.requests[0].options.body),{credential:'first-provider-credential'});
 await p.google({credential:'fresh-provider-credential'});assert.deepEqual(JSON.parse(p.requests[1].options.body),{credential:'fresh-provider-credential',password:'existing-password'});assert.equal(p.stored.get('freedomAuditToken'),'linked-app-session');assert.equal(p.get('password').value,'');assert.equal(p.run('state.googleLinkRequired'),false);assert(!JSON.stringify([...p.stored]).includes('provider-credential'));assert(!JSON.stringify([...p.stored]).includes('existing-password'));
});
test('cancel linking clears transient password and next Google attempt omits it',async()=>{
 const p=page(async()=>({status:409,body:{code:'GOOGLE_ACCOUNT_LINK_REQUIRED',message:'Link required'}}));await p.google({credential:'synthetic'});p.get('password').value='existing-password';p.run('cancelGoogleLinking()');assert.equal(p.run('state.googleLinkRequired'),false);assert.equal(p.get('password').value,'');await p.google({credential:'new-synthetic'});assert.deepEqual(JSON.parse(p.requests[1].options.body),{credential:'new-synthetic'});assert.equal(p.stored.size,0);
});

test('audit retention requires reviewed source and explicit consent, and sends references only',async()=>{
 const p=page(async()=>({status:200,body:{resultId:'own',sourceHash:'hash',expectedRetained:null,audit:{liberationPlan:['Full plan']},retention:'Until removed'}}));
 p.run("state.token='owner';configureAuditRetention({id:'own'})");assert.equal(p.requests.length,0);
 await p.get('retainAudit').onclick();assert.equal(p.requests.length,0);
 await p.get('reviewRetention').onclick();assert.equal(p.get('retainAudit').disabled,true);
 await p.get('retainAudit').onclick();assert.equal(p.requests.length,1);
 p.get('retainConsent').checked=true;p.get('retainConsent').onchange();await p.get('retainAudit').onclick();
 assert.deepEqual(JSON.parse(p.requests[1].options.body),{resultId:'own',sourceHash:'hash',expectedRetained:null,retain:true});assert.equal(p.get('retainConsent').checked,false);
});
test('retention review ignores a prior account response and cannot submit its audit',async()=>{
 let release;const p=page(()=>new Promise(r=>release=r));p.run("state.token='old';configureAuditRetention({id:'old-audit'})");
 const pending=p.get('reviewRetention').onclick();p.run("state.token='new'");release({status:200,body:{resultId:'old-audit',sourceHash:'hash',audit:{private:'canary'}}});await pending;
 assert.equal(p.get('retentionAudit').textContent,'');p.get('retainConsent').checked=true;await p.get('retainAudit').onclick();assert.equal(p.requests.length,1);
});
