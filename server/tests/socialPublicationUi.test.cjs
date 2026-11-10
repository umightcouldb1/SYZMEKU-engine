const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../client/src/SocialCommandDashboard.jsx'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const methods=extract('  const loadAll =','\n  useEffect(')+extract('  const publishReleased =','\n  const refreshAnalytics =');
const approved=(id='a')=>({campaign:{_id:id,status:'approved',metadata:{c0:{storage:'GOOGLE_DRIVE',providerAccountId:'channel',privacyStatus:'private',scheduledTime:null}},posts:[{publishAttempts:0,publishStatus:'approved'}]},summary:{publishedPosts:0}});
function fixture({uploadError,readError,deferRead,latest}={}){
 const state={active:approved(),error:'',message:'',loading:false,campaigns:[],calls:[]};
 const initial=state.active;
 const context={activeCampaign:initial,window:{confirm:()=>true},setError:x=>{state.error=x;},setMessage:x=>{state.message=x;},setLoading:x=>{state.loading=x;},setProviders:()=>{},setConnections:()=>{},setCampaigns:x=>{state.campaigns=x;},setActiveCampaign:fn=>{state.active=typeof fn==='function'?fn(state.active):fn;},api:async(method,url)=>{
  state.calls.push({method,url});
  if(method==='post'){if(uploadError)throw uploadError;return {success:true};}
  if(url.endsWith('/providers'))return {providers:[]};
  if(url.endsWith('/connections'))return {connections:[]};
  if(url.endsWith('/campaigns'))return {campaigns:[approved('other').campaign],storageError:'secondary Drive warning'};
  if(deferRead)await deferRead;
  if(readError)throw readError;
  return latest||{...approved(),campaign:{...approved().campaign,posts:[{publishAttempts:1,publishStatus:'published',providerPostId:'verified-video'}]},summary:{publishedPosts:1}};
 }};
 vm.createContext(context);vm.runInContext(methods+'\nglobalThis.handlers={publishReleased,loadAll};',context);
 return {state,...context.handlers};
}
test('successful upload refreshes the exact selected campaign, including result and summary, outside the list page',async()=>{
 const f=fixture();await f.publishReleased();assert.equal(f.state.active.campaign._id,'a');assert.equal(f.state.active.campaign.posts[0].publishAttempts,1);assert.equal(f.state.active.campaign.posts[0].providerPostId,'verified-video');assert.equal(f.state.active.summary.publishedPosts,1);assert.equal(f.state.active.publicationRefreshPending,false);assert.equal(f.state.error,'');assert.equal(f.state.loading,false);assert(f.state.calls.some(x=>x.url==='/api/social-command/campaigns/a'));
});
test('uncertain-upload error survives refresh and latest attempt prevents another publish',async()=>{
 const latest=approved();latest.campaign.posts[0]={publishAttempts:1,publishStatus:'failed'};
 const f=fixture({uploadError:{response:{data:{code:'C0_PUBLICATION_INSPECTION_REQUIRED'}}},latest});await f.publishReleased();assert.equal(f.state.error,'C0_PUBLICATION_INSPECTION_REQUIRED');assert.equal(f.state.active.campaign.posts[0].publishAttempts,1);assert.equal(f.state.active.campaign.posts[0].publishStatus,'failed');assert.equal(f.state.message,'');
});
test('failed refresh preserves the upload warning and keeps Publish locally blocked',async()=>{
 const f=fixture({uploadError:{response:{data:{code:'C0_PUBLICATION_INSPECTION_REQUIRED'}}},readError:Error('offline')});await f.publishReleased();assert.match(f.state.error,/^C0_PUBLICATION_INSPECTION_REQUIRED/);assert.match(f.state.error,/Publishing remains blocked/);assert.equal(f.state.active.publicationRefreshPending,true);assert.equal(f.state.active.campaign.posts[0].publishAttempts,0);assert.equal(f.state.loading,false);
 assert.match(source,/disabled=\{loading\|\|activeCampaign\?\.dirty\|\|activeCampaign\?\.publicationRefreshPending\|\|campaign\.posts\.some/);
});
test('confirmed upload with failed refresh is not misreported as upload failure',async()=>{
 const f=fixture({readError:Error('offline')});await f.publishReleased();assert.match(f.state.message,/confirmed/);assert.match(f.state.error,/confirmed the upload, but/);assert.equal(f.state.active.publicationRefreshPending,true);
});
test('late upload refresh preserves a newer campaign selection and its unsaved edits',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const f=fixture({deferRead:pending});const work=f.publishReleased();await new Promise(r=>setImmediate(r));const newer={...approved('b'),dirty:true};f.state.active=newer;resolve();await work;assert.equal(f.state.active,newer);assert.equal(f.state.active.campaign._id,'b');assert.equal(f.state.active.dirty,true);
});

test('a mismatched campaign refresh never clears the selected campaign pending guard',async()=>{
 const f=fixture({latest:approved('different-id')});await f.publishReleased();assert.equal(f.state.active.campaign._id,'a');assert.equal(f.state.active.publicationRefreshPending,true);assert.match(f.state.error,/latest campaign status could not be loaded/);
});

test('schedule activation explains not-before timing and preserves the exact approved request', async () => {
 const scheduledTime = '2099-02-01T12:00:00.000Z';
 for (const accepted of [false, true]) {
  const selected = approved();
  selected.campaign.metadata.c0.scheduledTime = scheduledTime;
  selected.campaign.posts = [{ _id: 'synthetic-post', connectedAccountId: 'synthetic-connection', scheduledTime }];
  const calls = [], confirmations = [], messages = [];
  const context = {
   activeCampaign: selected, window: { confirm: text => { confirmations.push(text); return accepted; } },
   setLoading: () => {}, setError: () => {}, setActiveCampaign: () => {}, setMessage: text => messages.push(text), loadAll: async () => {},
   api: async (...args) => { calls.push(args); return selected; },
  };
  vm.createContext(context);
  vm.runInContext(extract('  const activateSchedule =', '\n  const approveCampaign =') + '\nglobalThis.activate = activateSchedule;', context);
  await context.activate();
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /no earlier than 2099-02-01T12:00:00.000Z/);
  assert.match(confirmations[0], /five minutes by default while enabled and running/);
  assert.match(confirmations[0], /Server sleep or downtime/);
  assert.match(confirmations[0], /not an exact publication-time guarantee/);
  assert.equal(calls.length, accepted ? 1 : 0);
  if (accepted) {
   assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['post', '/api/social-command/campaigns/a/schedule', { postSchedules: [{ postId: 'synthetic-post', scheduledTime }] }]);
   assert.match(messages[0], /publication may be delayed/);
  }
 }
});

test('release timing warning is rendered before approval and on the recorded schedule', () => {
 const path = require('node:path'), Module = require('node:module');
 const client = path.resolve(__dirname, '../../client'), esbuild = require(path.join(client, 'node_modules/esbuild'));
 const filename = path.join(client, 'timing-test.cjs'), queuePath = path.join(client, 'src/ContentQueue.jsx');
 const result = esbuild.buildSync({ stdin: { contents: fs.readFileSync(queuePath, 'utf8') + '\nexport { ReleaseReview };', resolveDir: path.dirname(queuePath), loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', loader: { '.css': 'empty' }, external: ['react'] });
 const output = new Module(filename); output.filename = filename; output.paths = Module._nodeModulePaths(client); output._compile(result.outputFiles[0].text, filename);
 const React = require(path.join(client, 'node_modules/react')), { renderToStaticMarkup } = require(path.join(client, 'node_modules/react-dom/server'));
 for (const released of [false, true]) {
  const item = { id: 'synthetic-content', status: 'APPROVED', package: { platform: 'youtube' }, ...(released ? { release: { providerAccountId: 'synthetic-channel', privacyStatus: 'private', scheduledTime: '2099-02-01T12:00:00.000Z' } } : {}) };
  const html = renderToStaticMarkup(React.createElement(output.exports.ReleaseReview, { item, connections: [], act: () => { throw Error('Rendering must not act'); } }));
  assert.match(html, released ? /Approved not-before upload time:/ : /Optional not-before upload time/);
  assert.match(html, /not a guaranteed publication time/);
  assert.match(html, /every five minutes by default/);
  assert.match(html, /Server sleep or downtime, uploads and YouTube processing can delay publication/);
  assert(!html.includes('exact approved schedule'));
 }
 assert.match(source, /c0Release\?\.scheduledTime && <p>Scheduling uses the app, not YouTube's native scheduler/);
 esbuild.buildSync({ entryPoints: [path.join(client, 'src/SocialCommandDashboard.jsx')], bundle: true, write: false, platform: 'node', format: 'cjs', loader: { '.css': 'empty' }, external: ['react'] });
});
