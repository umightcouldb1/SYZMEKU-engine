const router=require('express').Router(),mongoose=require('mongoose'),asyncHandler=require('express-async-handler');
const {protect}=require('../middleware/authMiddleware'),{canRead,ownerId}=require('../enterprise/policy'),service=require('../enterprise/content/service'),workspace=require('../enterprise/content/workspaceConnection');
const db=()=>mongoose.connection.db;
const wrap=fn=>asyncHandler(async(req,res)=>{try{res.set('Cache-Control','private, no-store');await fn(req,res);}catch(e){res.status(e.statusCode||500).json({code:e.statusCode?e.message:'CONTENT_FACTORY_UNAVAILABLE'});}});
router.get('/google/callback',asyncHandler(async(req,res)=>{
 if(req.query.error)return res.redirect(302,workspace.commanderReturnUrl({workspace_status:'error',workspace_error:String(req.query.error).slice(0,120)}));
 if(!req.query.code||!req.query.state)return res.redirect(302,workspace.commanderReturnUrl({workspace_status:'error',workspace_error:'missing_oauth_code_or_state'}));
 try{const result=await workspace.handleCallback({code:String(req.query.code),state:String(req.query.state)});return res.redirect(302,workspace.commanderReturnUrl({workspace_status:'connected',workspace_account:result.accountEmail}));}
 catch(e){return res.redirect(302,workspace.commanderReturnUrl({workspace_status:'error',workspace_error:String(e.message||'workspace_connection_failed').slice(0,120)}));}
}));
router.use(protect,(req,res,next)=>canRead(req.user)&&service.active()?next():res.status(404).json({code:'NOT_FOUND'}));
router.get('/',wrap(async(_req,res)=>res.json(await service.list(db(),ownerId()))));
router.get('/connections',wrap(async(_req,res)=>res.json({connections:await db().collection('socialconnections').find({userId:new mongoose.Types.ObjectId(ownerId()),active:true},{projection:{provider:1,accountName:1,accountType:1}}).toArray()})));
router.get('/workspace/status',wrap(async(req,res)=>res.json(await workspace.getStatus({owner:ownerId(),verify:req.query.verify==='true'}))));
router.post('/workspace/connect',wrap(async(_req,res)=>res.json(await workspace.beginAuthorization({userId:ownerId()}))));
router.get('/workspace/assets',wrap(async(_req,res)=>{const reader=await require('../enterprise/content/driveMedia').createMediaReader({owner:ownerId()});res.json(await reader.listImages());}));
router.get('/workspace/media/:fileId',wrap(async(req,res)=>{if(!['image','video'].includes(req.query.kind))return res.status(400).json({code:'INVALID_MEDIA_KIND'});const reader=await require('../enterprise/content/driveMedia').createMediaReader({owner:ownerId()});res.json(await reader.inspect(req.params.fileId,req.query.kind));}));
router.get('/workspace/vids-boundary',wrap(async(_req,res)=>res.json({mode:'HYBRID_NOT_END_TO_END',capabilities:{privateDraftStorage:'IMPLEMENTED_DRIVE_ONLY',imageApproval:'EXACT_FOUNDER_SELECTION_BEFORE_VIDEO',slidesAssembly:'PRIVATE_DRIVE_PPTX_CONVERSION; live conversion verification pending',timelineAuthoring:'NO_VERIFIED_PUBLIC_API',vidsExport:'REQUEST_ONLY; polling and private Drive persistence pending',generation:'NOT_INVOKED; existing account entitlement and quota require verification'},limitations:['An interactive Google editor session may be usable, but unattended Vids production is not verified.','Approved images are embedded in memory and converted in private Drive; visual conversion fidelity still requires review.','drive.file can only access files the app created or the founder explicitly opened/selected for the app.','No new paid API usage, subscription or public media upload is enabled.']})));
router.post('/prepare',wrap(async(_req,res)=>{
 const prepared=await service.prepareDaily({db:db()});
 const review=await service.materializeFounderReview({db:db(),owner:ownerId()});
 res.json({prepared,review});
}));
router.post('/materialize-review',wrap(async(_req,res)=>res.json(await service.materializeFounderReview({db:db(),owner:ownerId()}))));
router.post('/:id/google-slides',wrap(async(req,res)=>{if(Object.keys(req.body||{}).some(k=>!['expectedHash','expectedRevision'].includes(k)))return res.status(400).json({code:'EXACT_VERSIONS_REQUIRED'});res.json(await service.assembleApprovedImages({db:db(),owner:ownerId(),id:req.params.id,...req.body}));}));
router.post('/approve',wrap(async(req,res)=>{if(Object.keys(req.body||{}).some(k=>k!=='items'))return res.status(400).json({code:'EXACT_VERSIONS_REQUIRED'});res.json(await service.approveMany({db:db(),client:mongoose.connection.getClient(),owner:ownerId(),items:req.body.items}));}));
router.patch('/:id',wrap(async(req,res)=>{if(Object.keys(req.body||{}).some(k=>!['expectedHash','expectedRevision','action','patch','feedback'].includes(k)))return res.status(400).json({code:'INVALID_CONTENT_ACTION'});res.json(await service.change({db:db(),owner:ownerId(),id:req.params.id,...req.body}));}));
router.post('/:id/media-review',wrap(async(req,res)=>{if(Object.keys(req.body||{}).some(k=>!['expectedHash','expectedRevision','media','checks'].includes(k)))return res.status(400).json({code:'INVALID_MEDIA_REVIEW'});res.json(await service.attachReviewedMedia({db:db(),owner:ownerId(),id:req.params.id,...req.body}));}));
router.post('/:id/image-approval',wrap(async(req,res)=>{if(Object.keys(req.body||{}).some(k=>!['expectedHash','expectedRevision','images','referenceSha256'].includes(k)))return res.status(400).json({code:'EXACT_SCENE_IMAGES_REQUIRED'});res.json(await service.approveImages({db:db(),owner:ownerId(),id:req.params.id,...req.body}));}));
router.get('/:id/bundle',wrap(async(_req,res)=>res.status(409).json({code:'DRAFT_EXPORT_DRIVE_ONLY',message:'Approval drafts remain in Google Drive.'})));
module.exports=router;
