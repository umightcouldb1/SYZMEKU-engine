const {requireCoreScope,requireCoreWrite,scopeError}=require('./coreScopeService');
function enabled(){
  const {userId}=requireCoreScope();
  const ids=String(process.env.CORE_PATTERN_USER_IDS||'').split(',').map(x=>x.trim().toLowerCase());
  return process.env.CORE_PATTERN_INTELLIGENCE_ENABLED==='true'&&ids.every(x=>/^[a-f\d]{24}$/.test(x))&&ids.includes(userId.toLowerCase());
}
function requirePatternRead(){if(!enabled())throw scopeError('Pattern Intelligence is not available for this account.',404);}
function requirePatternWrite(){requireCoreWrite();if(!enabled())throw scopeError('Pattern Intelligence is paused for this account.',503);}
async function recheckSession(){
  const {userId,sessionId}=requireCoreScope();
  const live=await require('../models/AuthSession').exists({userId,sessionId,revokedAt:null,expiresAt:{$gt:new Date()}});
  if(!live)throw scopeError('Authenticated session is no longer available.',401);
}
module.exports={enabled,requirePatternRead,requirePatternWrite,recheckSession};
