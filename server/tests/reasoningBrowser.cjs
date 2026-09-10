// Real browser + HTTP + disposable replica set. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'../..');let fixture,browser,socket;let seq=0;const pending=new Map(),errors=[];
 const cache=path.join(root,'.cache','reasoning-browser');fs.mkdirSync(cache,{recursive:true});const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 const html=path.join(root,'client','m3-fixture.html');
 try{
  fixture=await require('./reasoningFixture.cjs')();const {scope,founder,other}=fixture;const core=require('../services/coreContextService');
  let providerFailure=false;
  require('../services/modelRouter').generateStructured=async({prompt})=>{if(providerFailure)throw require('../services/reasoningCapabilityService').error('MODEL_UNAVAILABLE','Configured model is unavailable.',503);return {text:JSON.stringify(require('./reasoningFixture.cjs').modelOutput(prompt)),provider:'gemini',model:'fixture'};};
  await scope(founder,()=>core.saveContext({goals:[{description:'Publish a design portfolio',domain:'creative'}],constraints:[{description:'Do not publish the portfolio before October.',hard:true}]}));
  const {build}=await import(pathToFileURL(path.join(root,'client/node_modules/vite/dist/node/index.js'))),config=(await import(pathToFileURL(path.join(root,'client/vite.config.js')))).default;
  const virtual={name:'reasoning-browser-fixture',resolveId:id=>id==='virtual:reasoning-fixture'?'\0reasoning-fixture':undefined,load:id=>id==='\0reasoning-fixture'?`import React from 'react';import{createRoot}from'react-dom/client';import axios from'axios';import Panel from'/src/components/ReasoningPanel.jsx';import Context from'/src/components/CoreContextPanel.jsx';import'/src/dashboard.css';const other=new URLSearchParams(location.search).has('other');axios.defaults.headers.common.Authorization='Bearer '+(other?${JSON.stringify(other.token)}:${JSON.stringify(founder.token)});createRoot(document.getElementById('root')).render(React.createElement('main',{className:'mentor-shell'},React.createElement('h1',null,'M3 disposable browser fixture'),React.createElement(Context),React.createElement(Panel)));`:undefined};
  fs.writeFileSync(html,'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3 fixture</title></head><body style="background:#101d2c;color:#f1f5f9"><div id="root"></div><script type="module" src="virtual:reasoning-fixture"></script></body></html>');
  const dist=path.join(cache,'dist');await build({...config,configFile:false,root:path.join(root,'client'),plugins:[...config.plugins,virtual],build:{outDir:dist,emptyOutDir:false,rollupOptions:{input:html}}});fs.unlinkSync(html);
  fixture.app.get('/',(_req,res)=>res.sendFile(path.join(dist,'m3-fixture.html')));fixture.app.use(require('express').static(dist));
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
  const button=async text=>evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e)throw new Error('Button missing');e.click();return true;})()`);
  const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const ready=()=>waitFor(`[...document.querySelectorAll('button')].some(e=>e.textContent==='Generate preview'&&!e.disabled)`);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:fixture.base});await waitFor(`!!document.querySelector('[aria-label="Reasoning and planning"]')`);
  await evaluate(`document.querySelector('.reasoning-panel input[type="checkbox"]').click()`);await waitFor(`document.body.innerText.includes('1. Publish a design portfolio')`);
  await fill('.reasoning-panel textarea','Help me prepare a portfolio outline.');await ready();await button('Generate preview');
  await waitFor(`document.body.innerText.includes('Clarify the saved constraint')`);assert.equal(await require('../models/ReasoningRecord').collection.countDocuments({}),0);
  await button('Generate and save');await waitFor(`document.body.innerText.includes('Saved guidance')`);
  await call('Page.reload');await waitFor(`!!document.querySelector('[aria-label="Reasoning and planning"]')`);await button('Load saved guidance');await waitFor(`document.body.innerText.includes('Saved planner')`);
  await fill('.reasoning-panel textarea','Help me prepare a portfolio outline.');await ready();await button('Generate preview');await waitFor(`document.body.innerText.includes('Clarify the saved constraint')`);
  await waitFor(`[...document.querySelectorAll('button')].some(e=>e.textContent==='This constraint has changed…'&&!e.disabled)`);await button('This constraint has changed…');await waitFor(`!!document.querySelector('.reasoning-panel form textarea')`);await fill('.reasoning-panel form textarea','Personal autonomous execution disabled');await button('Confirm saved constraint correction');await waitFor(`!document.querySelector('.reasoning-panel form')`);
  await ready();await button('Generate preview');await waitFor(`document.body.innerText.includes('No supported Patterns are available')`);assert(await evaluate(`!!document.querySelector('[aria-label="Draft plan"]')`));assert(!await evaluate(`document.querySelector('.reasoning-result').innerText.includes('before October')`));
  await evaluate(`document.querySelector('.reasoning-result details summary').click()`);await button('Review recorded evidence (Goal)');await waitFor(`document.querySelector('.reasoning-result blockquote')?.innerText.includes('Publish a design portfolio')`);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'reasoning-desktop.png'),Buffer.from(r.data,'base64')));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'reasoning-mobile.png'),Buffer.from(r.data,'base64')));
  providerFailure=true;await button('Generate preview');await waitFor(`document.body.innerText.includes('Configured model is unavailable.')`);assert.equal(await evaluate(`!!document.querySelector('[aria-label="Draft plan"]')`),false);
  await call('Page.navigate',{url:fixture.base+'/?other=1'});await waitFor(`document.body.innerText.includes('What you want to build')`);await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate(`!!document.querySelector('[aria-label="Reasoning and planning"]')`),false);
  for(const name of ['Task','ActionExecution','ProtocolExecutionRecord'])assert.equal(await require('../models/'+name).collection.countDocuments({}),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['desktop/mobile','zero-write preview','explicit save','reload','constraint clarification','explicit M1 supersession','no resurrection','valid draft','honest insufficient evidence','provider error clears advice','founder-only hidden','zero execution effects','no browser exceptions'],screenshots:['reasoning-desktop.png','reasoning-mobile.png']}));
 }finally{if(fs.existsSync(html))fs.unlinkSync(html);if(socket)socket.close();if(browser)browser.kill();if(fixture)await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
