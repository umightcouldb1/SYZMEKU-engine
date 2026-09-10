const crypto=require('node:crypto');
const mongoose=require('mongoose');
const {enabled,ownerId}=require('./policy');
// Observe completed responses only. Never inspect bodies, cookies, tokens or user answers.
function observeBusiness(req,res,next){
  const path=req.path;
  const productRoutes=['/api/freedom-audit/checkout/session','/api/freedom-audit/score','/api/webhooks/stripe'];
  const authRoute=['/api/auth/google','/api/auth/login','/api/auth/register'].includes(path)&&req.get('origin')==='https://freedom.toisouljahacademy.com';
  if(req.method==='POST'&&(productRoutes.includes(path)||authRoute))res.once('finish',()=>{
    if(!enabled()||mongoose.connection.readyState!==1)return;
    const ok=res.statusCode>=200&&res.statusCode<300;
    const kind=authRoute?'auth':path.endsWith('/score')?'product':path.endsWith('/stripe')?'webhook':'checkout';
    const event={_id:crypto.randomUUID(),product:'freedom-audit',event:'server_'+kind+'_'+(ok?'success':'failure'),authority:'server_response',receivedAt:new Date(),cohort:String(req.user?._id||'')===ownerId()?'founder':'unclassified',status:res.statusCode};
    // These observations are best-effort operational telemetry, never payment/entitlement authority.
    void mongoose.connection.db.collection('enterpriseevents').insertOne(event).catch(()=>{});
  });
  next();
}
module.exports={observeBusiness};
