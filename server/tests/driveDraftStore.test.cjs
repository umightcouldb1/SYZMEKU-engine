require('./contentPrivateConfigFixture.cjs').configure();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, KIND, MAX_BYTES } = require('../enterprise/content/driveDraftStore');
const { hash } = require('../enterprise/content/qa');
const clone = value => structuredClone(value);
function fixture() {
  const docs = new Map(), files = new Map(), writes = [], requests = [];
  const email = require('./contentPrivateConfigFixture.cjs').BUSINESS_ACCOUNT;
  const meta = (id, mimeType, parents) => ({ id, mimeType, parents, trashed: false, owners: [{ me: true, emailAddress: email }], permissions: [{ type: 'user', role: 'owner', emailAddress: email }], capabilities: { canEdit: true } });
  files.set('organic', { meta: meta('organic','application/vnd.google-apps.folder',['factory']) });
  function matches(doc, query) { return doc && Object.entries(query).every(([k,v]) => v && typeof v === 'object' && '$exists' in v ? (doc[k] !== undefined) === v.$exists : doc[k] === v); }
  const collection = {
    async findOne(query) { return clone([...docs.values()].find(d => matches(d,query)) || null); },
    find(query) { const c = { sort() { return c; }, limit(n) { c.n=n; return c; }, async toArray() { return clone([...docs.values()].filter(d=>matches(d,query)).slice(0,c.n)); } }; return c; },
    async updateOne(query, update, options={}) {
      writes.push(clone(update)); let doc = [...docs.values()].find(d=>matches(d,query));
      if (!doc && options.upsert) { if(docs.has(query._id)) throw Object.assign(new Error('duplicate'),{code:11000}); doc={...query,...update.$setOnInsert}; docs.set(doc._id,doc); }
      if (!doc) return { modifiedCount:0 };
      Object.assign(doc,clone(update.$set || {})); for(const k of Object.keys(update.$unset||{})) delete doc[k]; return { modifiedCount:1 };
    }
  };
  const connection = { userId:'owner',status:'connected',accountEmail:email,scopes:['https://www.googleapis.com/auth/drive.file'],metadata:{canonicalStorage:{provider:'GOOGLE_DRIVE',contentFactoryFolderId:'factory',folders:{Organic:'organic'}}} };
  const workspace = { async getFreshAccessToken() { return {connection,accessToken:'secret-token'}; } };
  const fetchImpl = async (url,options) => {
    requests.push({url,options});
    if (url.includes('/upload/')) {
      if (fixtureState.onUpload) await fixtureState.onUpload();
      const boundary = options.headers['Content-Type'].split('boundary=')[1];
      const parts=options.body.toString().split('--'+boundary), metadata=JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const body=Buffer.from(parts[2].split('\r\n\r\n')[1].replace(/\r\n$/,'')), id='file'+files.size;
      files.set(id,{meta:{...meta(id,'application/json',metadata.parents),appProperties:metadata.appProperties,size:String(body.length)},body});
      return Response.json({id});
    }
    const parsed=new URL(url), id=parsed.pathname.split('/').at(-1), file=files.get(id);
    if(!file) return new Response('',{status:404});
    return parsed.searchParams.get('alt')==='media' ? new Response(file.body) : Response.json(file.meta);
  };
  const fixtureState = {docs,files,writes,requests,connection,workspace,fetchImpl,db:{collection:()=>collection}};
  fixtureState.store=createStore({...fixtureState,owner:'owner'}); return fixtureState;
}
function record(title='private-title') { const p={title,script:'private-script',mediaUrl:'https://private.example/draft'};return {owner:'owner',itemId:'social:123',currentVersion:1,versions:[{number:1,hash:hash(p),package:p}],status:'DRAFT',approval:null}; }

test('immutable Drive blob round trip; Mongo never receives content; idempotent identical save',async()=>{
 const f=fixture(),r=record(); await f.store.save({id:r.itemId,expectedHash:null,record:r});
 const loaded=await f.store.get(r.itemId);assert.deepEqual({...loaded,_drive:undefined},{...r,_drive:undefined});assert.deepEqual(await f.store.list(),[loaded]);
 const count=f.files.size;await f.store.save({id:r.itemId,expectedHash:r.versions[0].hash,expectedContentSha256:loaded._drive.contentSha256,record:loaded});assert.equal(f.files.size,count);
 const stored=JSON.stringify(f.writes);for(const secret of ['private-title','private-script','private.example','package','versions','approval']) assert.equal(stored.includes(secret),false);
 assert.equal([...f.docs.values()][0].kind,KIND);assert.ok(f.requests.every(r=>r.options.redirect==='error'));
});
test('stale write rejected; immutable old file retained',async()=>{
 const f=fixture(),r=record();await f.store.save({id:r.itemId,expectedHash:null,record:r});const loaded=await f.store.get(r.itemId);const next=record('new');await f.store.save({id:r.itemId,expectedHash:r.versions[0].hash,expectedContentSha256:loaded._drive.contentSha256,record:next});
 await assert.rejects(f.store.save({id:r.itemId,expectedHash:r.versions[0].hash,expectedContentSha256:loaded._drive.contentSha256,record:r}),/CONTENT_VERSION_CHANGED/);assert.equal(f.files.size,3);
});
test('concurrent initial save has exactly one winner',async()=>{
 const f=fixture(),r=record();let release,entered;const entry=new Promise(res=>entered=res);f.onUpload=async()=>{entered();await new Promise(res=>release=res);};
 const one=f.store.save({id:r.itemId,expectedHash:null,record:r});await entry;
 await assert.rejects(f.store.save({id:r.itemId,expectedHash:null,record:r}),/CONTENT_VERSION_CHANGED/);release();await one;assert.equal(f.files.size,2);
});
test('rejects shared folder, wrong identity and wrong OAuth account without uploading',async()=>{
 for (const corrupt of [f=>f.files.get('organic').meta.permissions.push({type:'anyone',role:'reader'}),f=>f.connection.userId='other',f=>f.connection.accountEmail='personal@example.com']) {
 const f=fixture();corrupt(f);await assert.rejects(f.store.save({id:'social:123',expectedHash:null,record:record()}));assert.equal(f.files.size,1);assert.equal(f.writes.length,0);
 }
});
test('rejects tampering and owner-isolated pointer lookups',async()=>{
 const f=fixture(),r=record();await f.store.save({id:r.itemId,expectedHash:null,record:r});
 const other=createStore({...f,owner:'other'});assert.equal(await other.get(r.itemId),null);assert.deepEqual(await other.list(),[]);
 const file=f.files.get('file1');file.body=Buffer.from('{}');await assert.rejects(f.store.get(r.itemId),/CHECKSUM_MISMATCH/);
});
test('upload failure fails closed without content fallback or token disclosure',async()=>{
 const f=fixture();f.onUpload=()=>{throw new Error('secret-token private-script');};await assert.rejects(f.store.save({id:'social:123',expectedHash:null,record:record()}),e=>e.message==='DRIVE_DRAFT_REQUEST_FAILED');
 assert.equal(await f.store.get('social:123'),null);assert.deepEqual(await f.store.list(),[]);assert.ok(!JSON.stringify(f.writes).includes('private-script'));
});
test('bounded content and invalid content hash reject before network',async()=>{
 const f=fixture();await assert.rejects(f.store.save({id:'social:123',expectedHash:null,record:record('x'.repeat(MAX_BYTES))}),/TOO_LARGE/);
 const r=record();r.versions[0].hash='bad';await assert.rejects(f.store.save({id:r.itemId,expectedHash:null,record:r}),/INVALID_DRAFT_RECORD/);assert.equal(f.requests.length,0);
});

test('status-only stale revision cannot overwrite decision even when package hash is unchanged',async()=>{
 const f=fixture(),r=record(),saved=await f.store.save({id:r.itemId,expectedHash:null,record:r});
 const held=await f.store.save({id:r.itemId,expectedHash:saved._drive.packageHash,expectedContentSha256:saved._drive.contentSha256,record:{...saved,status:'HOLD'}});
 assert.equal(held._drive.packageHash,saved._drive.packageHash);assert.notEqual(held._drive.contentSha256,saved._drive.contentSha256);
 await assert.rejects(f.store.save({id:r.itemId,expectedHash:saved._drive.packageHash,expectedContentSha256:saved._drive.contentSha256,record:{...saved,status:'APPROVED'}}),/CONTENT_VERSION_CHANGED/);
 await assert.rejects(f.store.save({id:r.itemId,expectedHash:saved._drive.packageHash,record:r}),/EXACT_REVISION_REQUIRED/);
 assert.equal((await f.store.get(r.itemId)).status,'HOLD');
});
test('uploaded file verification failure leaves orphan in Drive, never publishes pointer',async()=>{
 const f=fixture();const original=f.fetchImpl;
 const fetchImpl=async(url,options)=>{const response=await original(url,options);if(url.includes('/upload/')) f.files.get('file1').meta.permissions.push({type:'anyone',role:'reader'});return response;};
 const store=createStore({...f,fetchImpl,owner:'owner'});
 await assert.rejects(store.save({id:'social:123',expectedHash:null,record:record()}),/PRIVATE_OWNER_REQUIRED/);
 assert.equal(f.files.size,2);assert.equal(await store.get('social:123'),null);assert.equal(f.requests.some(r=>r.options.method==='DELETE'),false);
});
test('stored app properties and MIME are checked on every read',async()=>{
 for(const mutate of [m=>m.appProperties.owner='other',m=>m.mimeType='text/plain',m=>m.parents=['wrong'],m=>m.trashed=true]) {
 const f=fixture();await f.store.save({id:'social:123',expectedHash:null,record:record()});mutate(f.files.get('file1').meta);await assert.rejects(f.store.get('social:123'));
 }
});
test('crashed operation is not stolen; listing is bounded and no network occurs for empty queue',async()=>{
 const f=fixture();assert.deepEqual(await f.store.list(),[]);assert.equal(f.requests.length,0);
 f.docs.set('c0:drive-draft:owner:social:123',{_id:'c0:drive-draft:owner:social:123',owner:'owner',kind:KIND,itemId:'social:123',sha256:null,contentSha256:null,operationId:'crashed'});
 await assert.rejects(f.store.save({id:'social:123',expectedHash:null,record:record()}),/CONTENT_VERSION_CHANGED/);assert.equal(f.files.size,1);
});
