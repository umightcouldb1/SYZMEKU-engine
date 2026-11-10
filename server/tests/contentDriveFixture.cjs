const crypto=require('node:crypto');
const {hash}=require('../enterprise/content/qa');
const {ORIGINAL_LOGO_FILE_ID,BUSINESS_ACCOUNT}=require('./contentPrivateConfigFixture.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function fakeGoogle(owner){
 const account=BUSINESS_ACCOUNT,files=new Map(),calls=[];let sequence=0;
 const privateMeta=(id,mimeType)=>({id,mimeType,trashed:false,owners:[{me:true,emailAddress:account}],permissions:[{type:'user',role:'owner',emailAddress:account}],capabilities:{canEdit:true,canDownload:true}});
 const folder='draft_folder_123456',factory='factory_folder_123456';files.set(folder,{meta:{...privateMeta(folder,'application/vnd.google-apps.folder'),parents:[factory]}});
 function asset(id,mimeType,body){const bytes=Buffer.from(body);files.set(id,{meta:{...privateMeta(id,mimeType),name:id,size:String(bytes.length),sha256Checksum:digest(bytes)},bytes});}
 asset(ORIGINAL_LOGO_FILE_ID,'image/jpeg','synthetic-logo');asset('source_image_123456','image/png','synthetic-image');asset('review_video_123456','video/mp4','synthetic-video');
 const workspace={getFreshAccessToken:async()=>({accessToken:'test-only',connection:{userId:owner,accountEmail:account,status:'connected',scopes:['https://www.googleapis.com/auth/drive.file'],metadata:{canonicalStorage:{provider:'GOOGLE_DRIVE',contentFactoryFolderId:factory,folders:{Organic:folder}}}}})};
 const fetchImpl=async(url,options={})=>{
  calls.push({url,method:options.method||'GET'});const u=new URL(url);
  if(u.hostname!=='www.googleapis.com')throw new Error('TEST_EXTERNAL_NETWORK_BLOCKED');
  if(u.pathname==='/upload/drive/v3/files'){
   const text=Buffer.from(options.body).toString('utf8'),boundary=options.headers['Content-Type'].split('boundary=')[1];const parts=text.split('--'+boundary);
   const metadata=JSON.parse(parts[1].split('\r\n\r\n')[1].replace(/\r\n$/,''));const bytes=Buffer.from(parts[2].split('\r\n\r\n')[1].replace(/\r\n$/,''));
   const id='draft_file_'+(++sequence).toString().padStart(8,'0');files.set(id,{meta:{...privateMeta(id,'application/json'),...metadata,id,size:String(bytes.length),sha256Checksum:digest(bytes)},bytes});return Response.json({id});
  }
  if(u.pathname==='/drive/v3/files')return Response.json({files:[...files.values()].filter(f=>f.meta.mimeType.startsWith('image/')).map(f=>f.meta)});
  const id=u.pathname.split('/').at(-1),file=files.get(id);if(!file)return Response.json({error:'missing'},{status:404});
  return u.searchParams.get('alt')==='media'?new Response(file.bytes):Response.json(file.meta);
 };
 return {workspace,fetchImpl,files,calls,asset};
}
async function seedLegacy(db,owner,id,p,status='DRAFT'){
 const record={_id:`c0:item:${owner}:${id}`,kind:'C0_ITEM',owner,itemId:id,currentVersion:1,versions:[{number:1,hash:hash(p),package:p,createdAt:new Date()}],status,approval:null,createdAt:new Date(),updatedAt:new Date()};
 await db.collection('enterprisestates').insertOne(record);return record;
}
module.exports={fakeGoogle,seedLegacy};
