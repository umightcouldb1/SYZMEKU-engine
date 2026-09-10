// Real browser + HTTP + disposable replica set. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'../..');let fixture,browser,socket;let seq=0;const pending=new Map(),errors=[];
 const cache=path.join(root,'.cache','content-factory-browser');fs.mkdirSync(cache,{recursive:true});const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 const html=path.join(root,'client','c0-fixture.html');
 try{

  fixture=await require('./patternFixture.cjs')();const {founder,other}=fixture;
  process.env.ENTERPRISE_INTELLIGENCE_ENABLED='true';process.env.ENTERPRISE_OWNER_USER_ID=founder.id;
  fixture.app.use('/api/content-factory',require('../routes/contentFactoryRoutes'));process.env.CONTENT_FACTORY_ENABLED='true';process.env.CONTENT_FACTORY_START_DATE=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());await require('../enterprise/content/service').prepareDaily({db:fixture.mongoose.connection.db});
  const brief=require('../enterprise/analysis').analyze({window:{start:'2026-09-09T05:00:00Z',end:new Date().toISOString()},social:{posts:[],connections:[],measurements:[],coverage:'synthetic receipts'},commerce:{ok:true,customerSessions:0,founderSessions:3,sales:0,revenue:0,attempts:0},product:{entitlements:0,completions:0},telemetry:{counts:[],since:null},auth:[],health:{api:{status:200,latencyMs:10}},personalExecution:'DISABLED',m3:'OFF'});
  await fixture.mongoose.connection.db.collection('enterprisestates').insertOne({_id:'freedom-audit:'+founder.id,owner:founder.id,brief,lastSuccessAt:new Date()});
  const {build}=await import(pathToFileURL(path.join(root,'client/node_modules/vite/dist/node/index.js'))),config=(await import(pathToFileURL(path.join(root,'client/vite.config.js')))).default;
  const entry="import React from 'react';import{createRoot}from'react-dom/client';import axios from'axios';import Panel from'/src/ContentQueue.jsx';const other=new URLSearchParams(location.search).has('other');axios.defaults.headers.common.Authorization='Bearer '+(other?"+JSON.stringify(other.token)+":"+JSON.stringify(founder.token)+");createRoot(document.getElementById('root')).render(React.createElement(Panel));";
  const virtual={name:'content-factory-browser-fixture',resolveId:id=>id==='virtual:content-factory-fixture'?'\0content-factory-fixture':undefined,load:id=>id==='\0content-factory-fixture'?entry:undefined};
  fs.writeFileSync(html,'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>E0 fixture</title></head><body style="margin:0;background:#101522"><div id="root"></div><script type="module" src="virtual:content-factory-fixture"></script></body></html>');
  const dist=path.join(cache,'dist');await build({...config,configFile:false,root:path.join(root,'client'),plugins:[...config.plugins,virtual],build:{outDir:dist,emptyOutDir:false,rollupOptions:{input:html}}});fs.unlinkSync(html);
  fixture.app.get('/',(_req,res)=>res.sendFile(path.join(dist,'c0-fixture.html')));fixture.app.use(require('express').static(dist));
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

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Page.navigate',{url:fixture.base});await waitFor("document.body.innerText.includes('PACKAGE_READY_MEDIA_PENDING')");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await evaluate("document.body.innerText.includes('TOI_VOICE_V1')"),true);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>fs.writeFileSync(path.join(cache,'content-mobile.png'),Buffer.from(r.data,'base64')));
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='APPROVE').disabled"),true);
  await evaluate("[...document.querySelector('[data-content-id=variant-b-facebook]').querySelectorAll('button')].find(b=>b.textContent==='HOLD').click()");
  await waitFor("document.querySelector('[data-content-id=variant-b-facebook]').innerText.includes('HOLD')");
  for(let tries=0;tries<30;tries++){const d=await fixture.mongoose.connection.db.collection('enterprisestates').findOne({itemId:'variant-b-facebook'});if(d.status==='HOLD')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal((await fixture.mongoose.connection.db.collection('enterprisestates').findOne({itemId:'variant-b-facebook'})).status,'HOLD');
  assert.equal(await fixture.mongoose.connection.db.collection('socialcampaigns').countDocuments({}),0);
  await call('Page.reload');await waitFor("document.body.innerText.includes('PACKAGE_READY_MEDIA_PENDING')");
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>fs.writeFileSync(path.join(cache,'content-desktop.png'),Buffer.from(r.data,'base64')));
  await call('Page.navigate',{url:fixture.base+'/?other=1'});await waitFor("document.body.innerText.includes('Content Factory is not enabled for this account.')");
  assert.equal(await evaluate("document.body.innerText.includes('What Keeps Getting in the Way')"),false);
  assert.equal(await fixture.mongoose.connection.db.collection('tasks').countDocuments({}),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['390px mobile no overflow','1440px desktop','real HTTP owner isolation','reload persistence','blocked unfinished-media approval', 'hold persistence', 'zero Social drafts/publishing','no browser exceptions','zero Task effects']}));
 }finally{if(fs.existsSync(html))fs.unlinkSync(html);if(socket)socket.close();if(browser)browser.kill();if(fixture)await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

