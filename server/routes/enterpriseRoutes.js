const router=require('express').Router(),rateLimit=require('express-rate-limit'),mongoose=require('mongoose');
const {protect}=require('../middleware/authMiddleware');
const {enabled,ownerId,canRead,parseEvent}=require('../enterprise/policy');
const asyncHandler=require('express-async-handler');
router.post('/events',rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}),asyncHandler(async(req,res)=>{
  if(!enabled()||req.get('origin')!=='https://freedom.toisouljahacademy.com')return res.sendStatus(204);
  const event=parseEvent(req.body);if(!event)return res.status(400).json({code:'INVALID_BUSINESS_EVENT'});
  try{await mongoose.connection.db.collection('enterpriseevents').updateOne({_id:event._id},{$setOnInsert:{...event,receivedAt:new Date()}},{upsert:true});}catch(e){if(e.code!==11000)return res.sendStatus(503);}
  return res.sendStatus(204);
}));
router.use(protect,(req,res,next)=>canRead(req.user)?next():res.status(404).json({code:'NOT_FOUND'}));
router.get('/brief',asyncHandler(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const owner=ownerId();
  const state=await mongoose.connection.db.collection('enterprisestates').findOne({_id:'freedom-audit:'+owner,owner},{projection:{brief:1,lastSuccessAt:1,lastError:1,lastErrorAt:1}});
  const ledger=await mongoose.connection.db.collection('enterprisedecisions').find({owner},{projection:{owner:0}}).sort({createdAt:-1}).limit(50).toArray();
  return res.json({status:state?.brief?'READY':'AWAITING_FIRST_ANALYSIS',stale:!state?.lastSuccessAt||Date.now()-state.lastSuccessAt>35*60*1000,lastSuccessAt:state?.lastSuccessAt||null,lastError:state?.lastError||null,brief:state?.brief||null,ledger});
}));
router.patch('/decisions/:id',asyncHandler(async(req,res)=>{
  const {decision,interpretation,actualResult}=req.body||{};
  if(Object.keys(req.body||{}).some(k=>!['decision','interpretation','actualResult'].includes(k))||!['keep','revert','iterate','failed','rejected','pending'].includes(decision)||[interpretation,actualResult].some(v=>typeof v!=='string'||v.length>600))return res.status(400).json({code:'INVALID_DECISION'});
  // Records a founder assessment; never approves or dispatches execution.
  const result=await mongoose.connection.db.collection('enterprisedecisions').updateOne({_id:req.params.id,owner:ownerId()},{$set:{decision,interpretation,actualResult,reviewedAt:new Date()}});
  return res.status(result.matchedCount?200:404).json({recorded:!!result.matchedCount,execution:'DISABLED'});
}));
module.exports=router;
