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
