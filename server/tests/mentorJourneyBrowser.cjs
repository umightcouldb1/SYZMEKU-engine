// Production React routes + real local APIs + disposable Mongo. AI is deterministic; no external calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'../..');let fixture,browser,socket;let seq=0;const pending=new Map(),errors=[];
 const cache=path.join(root,'.cache','mentor-browser');fs.mkdirSync(cache,{recursive:true});const profile=fs.mkdtempSync(path.join(cache,'chrome-'));
 let latestPrompt='';
 const reply='Maya, let’s protect a little time for printmaking. Try one small sketch before opening messages. What would make that feel manageable?';
 const router=require('../services/modelRouter');
 router.requestModelText=async()=>({text:'We can explore printmaking together at your pace.',model:'fixture'});
 router.requestModelJson=async({prompt})=>{latestPrompt=prompt;return {data:{candidates:[{content:{parts:[{text:JSON.stringify({response:reply,objectives:['Short objective'],constraints:[],risks:[],leverage:[],next_actions:[]})}]}}]}};};
 try{
  fixture=await require('./reasoningFixture.cjs')();
  const {build}=await import(pathToFileURL(path.join(root,'client/node_modules/vite/dist/node/index.js'))),config=(await import(pathToFileURL(path.join(root,'client/vite.config.js')))).default;
  const dist=path.join(cache,'dist');await build({...config,configFile:false,root:path.join(root,'client'),define:{'import.meta.env.VITE_API_URL':JSON.stringify(fixture.base),'import.meta.env.VITE_GOOGLE_CLIENT_ID':JSON.stringify('')},build:{outDir:dist,emptyOutDir:false}});
  fixture.app.use(require('express').static(dist));fixture.app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
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
  const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);

  await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://*']});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:fixture.base+'/welcome'});await waitFor(`document.body.textContent.includes('Meet BIG SYZ')`);
  await fill('#guest-message','I want to return to printmaking.');await button('Send message');
  await waitFor(`document.body.textContent.includes('We can explore printmaking together')`);
  assert.equal(await evaluate(`sessionStorage.getItem('big-syz-guest-conversation')`),null);
  await evaluate(`document.querySelector('input[type="checkbox"]').click()`);await button('Create an account');
  await waitFor(`!!document.querySelector('input[type="password"]')`);
  await fill('input[type="text"]','Maya');await fill('input[type="email"]','browser-mentor@example.test');await fill('input[type="password"]','Synthetic-browser-123!');
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`document.body.textContent.includes('What should I call you?')`);
  const user=await require('../models/User').findOne({email:'browser-mentor@example.test'}).lean();assert.equal(user.role,'USER');process.env.CORE_CONTEXT_WRITE_USER_IDS+=','+user._id;
  await fill('.onboarding-input','Maya');await button('Continue');
  await button('I’m building something meaningful');await button('Continue');
  await fill('.onboarding-textarea','I miss printmaking and want a gentle return.');await button('Continue');
  await waitFor(`document.body.textContent.includes('How do you want me')`);await button('Calm and grounding');await button('Continue');
  await fill('.onboarding-textarea','Return to printmaking');await button('Continue');
  await button('ENTER BIG SYZ HOME');await waitFor(`document.body.textContent.includes('Continue where we started?')`);
  assert.equal(await evaluate(`!!document.querySelector('.mentor-operator-entry')`),false);
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="Big SYZ double ring status"]')`),false);
  await button('Save to this account');await waitFor(`document.querySelector('.mentor-conversation-thread')?.innerText.includes('return to printmaking')`);
  assert.equal(await evaluate(`sessionStorage.getItem('big-syz-guest-conversation')`),null);
  await fill('#mentor-chat-input','Help me start gently.');await button('Talk to Big SYZ');
  await waitFor(`document.querySelector('.mentor-conversation-thread')?.innerText.includes('one small sketch')`);
  assert(latestPrompt.includes('Calm and grounding'));assert(latestPrompt.includes('return to printmaking'));
  // End the authenticated server session, then sign in normally again.
  await evaluate(`fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('token')}}).then(()=>{localStorage.clear();location.href='/login';})`);
  await waitFor(`!!document.querySelector('input[type="password"]')`);
  await fill('input[type="email"]','browser-mentor@example.test');await fill('input[type="password"]','Synthetic-browser-123!');await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`document.querySelector('.mentor-conversation-thread')?.innerText.includes('one small sketch')`);
  await fill('#mentor-chat-input','Can we continue from that suggestion?');await button('Talk to Big SYZ');
  await waitFor(`document.querySelector('.mentor-conversation-thread')?.innerText.includes('Can we continue from that suggestion?')`);
  await waitFor(`document.querySelectorAll('.mentor-message-syz').length >= 4 && !document.querySelector('.is-pending')`);
  assert(latestPrompt.includes(reply));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>fs.writeFileSync(path.join(cache,'mentor-mobile.png'),Buffer.from(r.data,'base64')));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:['guest consent','real signup','onboarding','account confirmation','full guidance','logout and second login','returning context','customer-only UI','mobile width'],provider:'mocked; no paid calls',screenshot:path.join(cache,'mentor-mobile.png')}));
 }finally{if(socket)socket.close();if(browser)browser.kill();if(fixture)await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
