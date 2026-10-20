// Local-only customer journey: real HTTP/auth/Mongoose; fake Stripe and Gemini.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
async function main(){
 Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'disposable-audit-browser',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',FREEDOM_AUDIT_STRIPE_PRICE_ID:'price_fixture',GEMINI_API_KEY:'fake-browser-key'});
 delete process.env.MONGO_URI;delete process.env.FREEDOM_AUDIT_AI_TEST_MODE;
 const root=path.resolve(__dirname,'../..'),cache=path.join(root,'.cache','audit-browser');fs.mkdirSync(cache,{recursive:true});
 const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 const mongoose=require('mongoose'),express=require('express'),{MongoMemoryReplSet}=require('mongodb-memory-server');
 let db,server,browser,socket,base,session,providerFailure=false;let seq=0;const pending=new Map(),errors=[];
 const originalFetch=global.fetch;
 try {
  db=await MongoMemoryReplSet.create({replSet:{count:1,dbName:'audit_browser'}});await mongoose.connect(db.getUri());
  const stripe=require('stripe')('sk_test_fixture');
  const price={id:'price_fixture',active:true,unit_amount:3700,currency:'usd',product:{id:'prod_fixture',active:true,name:'Freedom Audit'}};
  require.cache[require.resolve('stripe')].exports=()=>({webhooks:stripe.webhooks,prices:{retrieve:async()=>price},checkout:{sessions:{create:async input=>{session={id:'cs_browser',mode:'payment',status:'complete',payment_status:'paid',client_reference_id:input.client_reference_id};return {url:base+'/?checkout=success&session_id=cs_browser'};},retrieve:async()=>session,listLineItems:async()=>({data:[{price,amount_total:3700,currency:'usd'}]})}}});
  global.fetch=async(url,options)=>{
   if(String(url).startsWith('https://generativelanguage.googleapis.com/')){
    if(providerFailure)return new Response('{}',{status:503});
    const prompt=JSON.parse(options.body).contents[0].parts[0].text;
    const a=JSON.parse(prompt.split('ASSESSMENT DATA: ')[1].split('\nEVIDENCE MAP:')[0]);
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(require('./freedomAuditPlanFixture.cjs')(a))}]}}]});
   }return originalFetch(url,options);
  };
  const app=express();app.use('/api/webhooks',require('../routes/webhook'));app.use(express.json());app.use('/api/auth',require('../routes/authRoutes'));app.use('/api/freedom-audit',require('../routes/freedomAuditRoutes'));
  app.use((e,_req,res,_next)=>res.status(e.statusCode||(res.statusCode>=400?res.statusCode:500)).json({error:e.message}));
  app.get('/business-telemetry.js',(_req,res)=>res.type('js').send(''));
  app.get('/',(_req,res)=>res.type('html').send(fs.readFileSync(path.join(root,'freedom-audit/index.html'),'utf8').replaceAll('__FREEDOM_AUDIT_API_BASE__',base+'/api')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;process.env.FREEDOM_AUDIT_APP_URL=base;
  const chrome=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
  browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--no-first-run','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const wsURL=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);browser.on('error',reject);browser.stderr.on('data',b=>{const match=String(b).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
  socket=new WebSocket(wsURL);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
  await call('Runtime.enable');await call('Page.enable');
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function waitFor(expression){const until=Date.now()+15000;while(Date.now()<until){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser assertion timed out: '+expression+'; body='+await evaluate('document.body.innerText'));}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});await waitFor("!!document.getElementById('heroStart')");
  await evaluate("document.getElementById('heroStart').click();document.getElementById('signupTab').click();document.getElementById('name').value='Audit Buyer';document.getElementById('email').value='auditbuyer@example.test';document.getElementById('password').value='Disposable-password-123';document.getElementById('authSubmit').click()");
  await waitFor("document.getElementById('sessionStatus').textContent.includes('Payment required')");
  assert.equal(await evaluate("state.entitled"),false);
  await evaluate("document.getElementById('checkoutButton').click()");
  await waitFor("!document.getElementById('audit').classList.contains('hidden')");
  await evaluate("document.querySelectorAll('input[type=radio]').forEach(e=>e.checked=e.value==='2');document.getElementById('win').value='Publish a design portfolio';document.getElementById('drag').value='Repeated scheduling';document.getElementById('asset').value='Design templates';document.getElementById('generateButton').click()");
  await waitFor("!document.getElementById('result').classList.contains('hidden')");
  assert.equal(await evaluate("document.querySelectorAll('#plan li').length"),6);
  assert.match(await evaluate("document.getElementById('plan').textContent"),/Design templates/);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'audit-desktop.png'),Buffer.from(r.data,'base64')));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'audit-mobile.png'),Buffer.from(r.data,'base64')));
  await call('Page.navigate',{url:base});await waitFor("!!document.getElementById('heroResults')");await evaluate("document.getElementById('heroResults').click()");
  await waitFor("document.getElementById('plan').textContent.includes('Design templates')");
  providerFailure=true;await evaluate("document.getElementById('retake').click();document.querySelectorAll('input[type=radio]').forEach(e=>e.checked=e.value==='3');document.getElementById('win').value='Organize receipts';document.getElementById('generateButton').click()");
  await waitFor("document.getElementById('auditError').textContent.includes('no new result was saved')");
  assert.equal(await evaluate("document.getElementById('win').value"),'Organize receipts');assert.equal(await evaluate("document.getElementById('generateButton').disabled"),false);
  providerFailure=false;await evaluate("document.getElementById('generateButton').click()");await waitFor("!document.getElementById('result').classList.contains('hidden')");
  const saved=await require('../models/UserProfile').findOne({});assert.equal(saved.freedomAudit.results.length,2);assert.equal(saved.purchasedProducts.length,1);
  await waitFor("document.getElementById('resultHistory').options.length===3");
  // A fresh password login retrieves the same persisted purchase/results.
  await evaluate("localStorage.removeItem('freedomAuditToken')");await call('Network.clearBrowserCookies');await call('Page.navigate',{url:base});await waitFor("!!document.getElementById('heroStart')");
  await evaluate("document.getElementById('heroStart').click();document.getElementById('email').value='auditbuyer@example.test';document.getElementById('password').value='Disposable-password-123';document.getElementById('authSubmit').click()");await waitFor("state.entitled===true");
  assert.equal(await evaluate("state.latestResult.inputs.win"),'Organize receipts');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',providers:'FAKE Stripe and Gemini, real auth/HTTP/MongoDB',checks:['signup','unpaid gate','checkout return verification','20 ratings','six evidence-backed phases','desktop/mobile','reload retrieval','provider failure preserves inputs','retry','retake history','returning password login']}));
 } finally {global.fetch=originalFetch;if(socket)socket.close();if(browser)browser.kill();if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
