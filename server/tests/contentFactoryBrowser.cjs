// Real browser + HTTP + disposable replica set. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'../..');let fixture,browser,socket,google,originalFetch,oldTokenGetter;let seq=0;const pending=new Map(),errors=[];
 const cache=path.join(root,'.cache','content-factory-browser');fs.mkdirSync(cache,{recursive:true});const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 const html=path.join(root,'client','c0-fixture.html');
 try{

  fixture=await require('./patternFixture.cjs')({mongoArgs:['--nounixsocket']});const {founder,other}=fixture;
  Object.assign(process.env,{ENTERPRISE_INTELLIGENCE_ENABLED:'true',ENTERPRISE_OWNER_USER_ID:founder.id,CONTENT_FACTORY_ENABLED:'true',CONTENT_FACTORY_START_DATE:'2026-11-07'});
  google=require('./contentDriveFixture.cjs').fakeGoogle(founder.id);
  delete google.files.get('source_image_123456').meta.sha256Checksum;
  const workspace=require('../enterprise/content/workspaceConnection');oldTokenGetter=workspace.getFreshAccessToken;workspace.getFreshAccessToken=google.workspace.getFreshAccessToken;
  originalFetch=global.fetch;global.fetch=(url,options)=>{
   if(String(url).startsWith('https://www.googleapis.com/'))return google.fetchImpl(url,options);
   if(new URL(url).hostname==='127.0.0.1')return originalFetch(url,options);
   throw new Error('TEST_EXTERNAL_NETWORK_BLOCKED');
  };
  fixture.app.use('/api/content-factory',require('../routes/contentFactoryRoutes'));
  fixture.app.use((e,_req,res,_next)=>res.status(e.statusCode||(res.statusCode>=400?res.statusCode:500)).json({code:e.message}));
  const service=require('../enterprise/content/service'),db=fixture.mongoose.connection.db;
  await service.prepareDaily({db,now:new Date('2026-11-07T18:00:00Z')});
  const beforeLegacy=await db.collection('enterprisestates').find({kind:'C0_ITEM'}).toArray();
  const {build}=await import(pathToFileURL(path.join(root,'client/node_modules/vite/dist/node/index.js'))),config=(await import(pathToFileURL(path.join(root,'client/vite.config.js')))).default;
  const entry="import React from 'react';import{createRoot}from'react-dom/client';import axios from'axios';import Panel from'/src/ContentQueue.jsx';const other=new URLSearchParams(location.search).has('other');axios.defaults.headers.common.Authorization='Bearer '+(other?"+JSON.stringify(other.token)+":"+JSON.stringify(founder.token)+");createRoot(document.getElementById('root')).render(React.createElement(Panel));";
  const virtual={name:'content-factory-browser-fixture',resolveId:id=>id==='virtual:content-factory-fixture'?'\0content-factory-fixture':undefined,load:id=>id==='\0content-factory-fixture'?entry:undefined};
  fs.writeFileSync(html,'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>E0 fixture</title></head><body style="margin:0;background:#101522"><div id="root"></div><script type="module" src="virtual:content-factory-fixture"></script></body></html>');
  const dist=path.join(cache,'dist');await build({...config,configFile:false,root:path.join(root,'client'),plugins:[...config.plugins,virtual],build:{outDir:dist,emptyOutDir:false,rollupOptions:{input:html}}});fs.unlinkSync(html);
  fixture.app.get('/',(_req,res)=>res.sendFile(path.join(dist,'c0-fixture.html')));fixture.app.use(require('express').static(dist));
  const chrome=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
  browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--no-first-run','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const wsURL=await new Promise((resolve,reject)=>{let stderr='';const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out: '+stderr.slice(-3000))),20000);const failed=error=>{clearTimeout(timeout);reject(error);};browser.on('error',failed);browser.on('exit',(code,signal)=>failed(new Error(`Chrome exited before startup (${code||signal}): ${stderr.slice(-3000)}`)));browser.stderr.on('data',b=>{stderr+=String(b);const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
  socket=new WebSocket(wsURL);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
  await call('Runtime.enable');await call('Page.enable');
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function waitFor(expression){const until=Date.now()+15000;while(Date.now()<until){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser assertion timed out: '+expression+'; body='+await evaluate('document.body.innerText'));}

  const card="document.querySelector('[data-content-id=variant-b-facebook]')";
  const button=text=>`[...${card}.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)})`;
  const click=async text=>{const target=button(text);await evaluate(`(async()=>{${target}.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);const box=await evaluate(`(()=>{const r=${target}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1});};
  const setValue=async(expression,value)=>evaluate(`(()=>{const e=${expression};Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const snapshot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(cache,name),Buffer.from(r.data,'base64'));};
  const readItem=async()=> (await service.list(db,founder.id)).items.find(i=>i.id==='variant-b-facebook');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Page.navigate',{url:fixture.base});await waitFor("document.body?.innerText.includes('IMAGE_SELECTION_REQUIRED')");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await evaluate("document.body?.innerText.includes('Drafts only in Google Drive.')"),true);
  assert.equal(await evaluate(`${button('APPROVE')}.disabled`),true);
  await snapshot('content-mobile.png');
  const first=await readItem();
  await click('EDIT');
  await setValue(`${card}.querySelector('input[maxlength="160"]')`,'Unsaved browser edit');
  await click('Cancel');
  assert.equal((await readItem()).hash,first.hash);
  assert.equal(await evaluate(`${card}.querySelector('h3').textContent`),first.package.title);
  await click('EDIT');assert.equal(await evaluate(`${card}.querySelector('input[maxlength="160"]').value`),first.package.title);await click('Cancel');
  // Refresh also proves cancellation never reached durable storage.
  await call('Page.reload');await waitFor("document.body?.innerText.includes('IMAGE_SELECTION_REQUIRED')");
  await click('EDIT');await setValue(`${card}.querySelector('input[maxlength="160"]')`,'What will you choose next?');
  await click('Save revision to Drive');
  await waitFor(`${card}.querySelector('h3').textContent==='What will you choose next?'`);
  const edited=await readItem();assert.equal(edited.version,first.version+1);assert.notEqual(edited.hash,first.hash);
  assert.equal(edited.storage.provider,'GOOGLE_DRIVE');
  // A real select change fetches the exact Drive image snapshot through HTTP.
  await evaluate(`${card}.querySelectorAll('details')[1].open=true`);
  await waitFor(`${card}.querySelector('select option[value="source_image_123456"]')!==null`);
  const selectCount=await evaluate(`${card}.querySelectorAll('details')[1].querySelectorAll('select').length`);
  assert.equal(await evaluate(`${button('Approve selected images')}.disabled`),true);
  for(let i=0;i<selectCount;i++)await setValue(`${card}.querySelectorAll('details')[1].querySelectorAll('select')[${i}]`,'source_image_123456');
  await waitFor(`${card}.querySelectorAll('a[href="https://drive.google.com/file/d/source_image_123456/view"]').length===${selectCount}`);
  assert.equal(await evaluate(`${button('Approve selected images')}.disabled`),true);
  await evaluate(`${card}.querySelectorAll('details')[1].querySelector('input[type=checkbox]').click()`);
  await waitFor(`${button('Approve selected images')}.disabled===false`);
  await click('Approve selected images');
  await waitFor(`${card}.textContent.includes('VIDEO_PRODUCTION_READY')`);
  const selected=await readItem();assert(selected.package.production.imageApproval.selectionHash);
  assert.equal(selected.package.production.media,null);
  assert.equal(await evaluate(`${button('APPROVE')}.disabled`),true);
  await evaluate(`${card}.querySelectorAll('details')[2].open=true`);
  assert.equal(await evaluate(`${button('Record my finished-video review')}.disabled`),true);
  await setValue(`${card}.querySelectorAll('details')[2].querySelector('input:not([type])')`,'review_video_123456');
  await click('Load exact video for review');
  await waitFor(`${card}.textContent.includes('Open this exact video in Drive before checking the review boxes')`);
  assert.equal(await evaluate(`${card}.querySelectorAll('details')[2].querySelector('form').checkValidity()`),false);
  // No review is recorded without the explicit complete manual checklist.
  assert.equal((await readItem()).package.production.media,null);
  await evaluate(`${card}.scrollIntoView()`);await snapshot('content-image-review-mobile.png');
  await click('HOLD');await waitFor(`${card}.querySelector('.content-card-top').textContent.includes('HOLD')`);
  const held=await readItem();assert.equal(held.status,'HOLD');
  assert.notEqual(held.revision,selected.revision);
  await call('Page.reload');await waitFor(`${card}?.querySelector('.content-card-top').textContent.includes('HOLD')`);
  assert.equal(await evaluate(`${button('Approve selected images')}.disabled`),true);
  assert.equal(await evaluate(`${button('APPROVE')}.disabled`),true);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await snapshot('content-desktop.png');
  await call('Page.navigate',{url:fixture.base+'/?other=1'});await waitFor("document.body?.innerText.includes('Content Factory is not enabled for this account.')");
  assert.equal(await evaluate("document.querySelectorAll('[data-content-id]').length"),0);
  assert.equal((await fixture.request(other,'/api/content-factory/workspace/media/source_image_123456?kind=image')).status,404);
  assert.deepEqual(await db.collection('enterprisestates').find({kind:'C0_ITEM'}).toArray(),beforeLegacy);
  const pointers=await db.collection('enterprisestates').find({kind:'C0_DRIVE_DRAFT_POINTER'}).toArray();
  assert(pointers.length>0);assert(pointers.every(p=>!p.package&&!p.versions&&!JSON.stringify(p).includes('What will you choose next?')));
  assert.equal(await db.collection('socialcampaigns').countDocuments({}),0);
  assert.equal(await db.collection('tasks').countDocuments({}),0);
  assert(google.calls.some(c=>c.url.includes('/source_image_123456?alt=media')));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['390px mobile no overflow','1440px desktop no overflow','real HTTP owner isolation','Drive reload persistence','exact image snapshot and image approval','finished-video checklist required','edit/cancel and edit/save','hold/reload','no Mongo draft bodies or Social drafts','no browser exceptions','zero Task effects']}));
 }finally{if(originalFetch)global.fetch=originalFetch;if(oldTokenGetter)require('../enterprise/content/workspaceConnection').getFreshAccessToken=oldTokenGetter;if(fs.existsSync(html))fs.unlinkSync(html);if(socket)socket.close();if(browser)browser.kill();if(fixture)await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

