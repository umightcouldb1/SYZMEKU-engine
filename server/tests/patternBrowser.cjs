// Real browser + HTTP + disposable replica set. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'../..');let fixture,browser,socket;let seq=0;const pending=new Map(),errors=[];
 const cache=path.join(root,'.cache','pattern-browser');fs.mkdirSync(cache,{recursive:true});const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 const html=path.join(root,'client','m2-fixture.html');
 try{
  fixture=await require('./patternFixture.cjs')();const {scope,founder,other}=fixture;const core=require('../services/coreContextService');
  await scope(founder,()=>core.saveContext({goals:[{description:'Publish a design portfolio',domain:'business'}]}));
  await scope(founder,()=>core.createTask({description:'Draft portfolio introduction'}));
  for(let i=0;i<4;i++)await scope(founder,()=>core.ingestObservation({domain:'business',sourceId:'browser-event-'+i,source:'user',occurredAt:new Date(Date.now()-(i+1)*86400000).toISOString(),event:{subjectKey:'focus-block',values:{completed:i<3}},notes:'Synthetic focus block '+i}));
  const {build}=await import(pathToFileURL(path.join(root,'client/node_modules/vite/dist/node/index.js'))),config=(await import(pathToFileURL(path.join(root,'client/vite.config.js')))).default;
  const virtual={name:'pattern-browser-fixture',resolveId:id=>id==='virtual:pattern-fixture'?'\0pattern-fixture':undefined,load:id=>id==='\0pattern-fixture'?`import React from 'react';import{createRoot}from'react-dom/client';import axios from'axios';import Panel from'/src/components/PatternPanel.jsx';import Context from'/src/components/CoreContextPanel.jsx';import'/src/dashboard.css';const other=new URLSearchParams(location.search).has('other');axios.defaults.headers.common.Authorization='Bearer '+(other?${JSON.stringify(other.token)}:${JSON.stringify(founder.token)});createRoot(document.getElementById('root')).render(React.createElement('main',{className:'mentor-shell'},React.createElement('h1',null,'M2 disposable browser fixture'),React.createElement(Context),React.createElement(Panel)));`:undefined};
  fs.writeFileSync(html,'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2 fixture</title></head><body style="background:#101d2c;color:#f1f5f9"><div id="root"></div><script type="module" src="virtual:pattern-fixture"></script></body></html>');
  const dist=path.join(cache,'dist');await build({...config,configFile:false,root:path.join(root,'client'),plugins:[...config.plugins,virtual],build:{outDir:dist,emptyOutDir:false,rollupOptions:{input:html}}});fs.unlinkSync(html);
  fixture.app.get('/',(_req,res)=>res.sendFile(path.join(dist,'m2-fixture.html')));fixture.app.use(require('express').static(dist));
  const chrome=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
  browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--no-first-run','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const wsURL=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);browser.on('error',reject);browser.stderr.on('data',b=>{const match=String(b).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
  socket=new WebSocket(wsURL);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
  await call('Runtime.enable');await call('Page.enable');
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  async function waitFor(expression){const until=Date.now()+15000;while(Date.now()<until){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser assertion timed out: '+expression+'; body='+await evaluate('document.body.innerText'));}
  const button=async text=>evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e)throw new Error('Button missing');e.click();return true;})()`);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:fixture.base});await waitFor(`!!document.querySelector('[aria-label="Patterns"]')`);
  await waitFor(`[...document.querySelectorAll('button')].some(e=>e.textContent==='Evaluate recorded evidence'&&!e.disabled)`);
  assert(await evaluate(`document.body.innerText.includes('No patterns in this view')`));
  await button('Evaluate recorded evidence');await waitFor(`!document.body.innerText.includes('Checking your records')`);
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Patterns"] select');e.value='candidate';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.body.innerText.includes('3 supporting episodes')`);assert(await evaluate(`document.body.innerText.includes('1 contradictory episodes')`));
  assert(await evaluate(`document.body.innerText.includes('tentative')`));assert.equal(await evaluate(`document.body.innerText.includes('33%')`),false);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'pattern-mobile.png'),Buffer.from(r.data,'base64')));
  await evaluate(`(()=>{const a=[...document.querySelectorAll('.pattern-panel article')].find(e=>e.innerText.includes('3 supporting episodes'));[...a.querySelectorAll('button')].find(e=>e.textContent==='Don’t show this again').click();})()`);await waitFor(`!document.body.innerText.includes('Checking your records')`);
  await call('Page.reload');await waitFor(`!!document.querySelector('[aria-label="Patterns"]')`);
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Patterns"] select');e.value='dismissed';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(`document.body.innerText.includes('3 supporting episodes')`);
  const first=await scope(founder,()=>require('../models/SignalEntry').findOne().lean());
  const response=await fixture.request(founder,'/api/core/signals/'+first._id,'PATCH',{expectedRevision:first.revision,notes:'Corrected browser source',event:{subjectKey:'focus-block',values:{completed:false}}});assert.equal(response.status,200);
  await call('Page.reload');await waitFor(`!!document.querySelector('[aria-label="Patterns"]')`);assert.equal(await evaluate(`document.body.innerText.includes('3 supporting episodes')`),false);
  await call('Page.navigate',{url:fixture.base+'/?other=1'});await waitFor(`document.body.innerText.includes('What you want to build')`);await new Promise(r=>setTimeout(r,400));assert.equal(await evaluate(`!!document.querySelector('[aria-label="Patterns"]')`),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['mobile render','real HTTP evaluation','tentative counts','contradictions','no probabilities','dismissal','reload persistence','source correction suppression','nonfounder hidden','no browser exceptions'],screenshot:path.join(cache,'pattern-mobile.png')}));
 }finally{if(fs.existsSync(html))fs.unlinkSync(html);if(socket)socket.close();if(browser)browser.kill();if(fixture)await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
