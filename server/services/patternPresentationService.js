const Pattern=require('../models/Pattern');
const capability=require('./patternCapabilityService');
const evidence=require('./patternEvidenceService');
const {scopeError}=require('./coreScopeService');
function current(p,epoch){return p.freshness==='current'&&p.evaluatedSourceEpoch===epoch&&+new Date(p.validUntil)>Date.now();}
async function checkRevisions(rows){for(const row of rows){const p=await Pattern.findById(row._id).select('revision').lean();if(!p||p.revision!==row.revision)throw scopeError('Pattern changed. Reload.',409);}}
async function dto(p,epoch){
  if(!current(p,epoch))return {id:String(p._id),revision:p.revision,state:p.state,freshness:'stale',message:'Evidence changed or expired. Evaluate again to review this hypothesis.'};
  const supporting=await evidence.resolveRefs(p.supportingEvidence.slice(0,25));
  const contradictions=await evidence.resolveRefs(p.contradictoryEvidence.slice(0,25));
  return {id:String(p._id),revision:p.revision,state:p.state,freshness:'current',family:p.family,domain:p.domain,hypothesis:p.hypothesis,rule:p.rule,confidence:p.confidence,counts:p.counts,window:p.observationWindow,methodVersion:p.methodVersion,supportingEvidence:supporting,contradictoryEvidence:contradictions,
    message:p.confidenceReasons.includes('MIXED_RECORDED_EVIDENCE')?'The recorded evidence is too mixed for this pattern to qualify as supported under the current method.':p.confidence==='insufficient'?'Not enough recorded evidence yet.':p.confidence==='tentative'?'A possible pattern; later recorded confirmation is still needed.':'Supported under the current method; this is an association, not proof of cause.',
    supportingEvidenceCount:p.supportingEvidence.length,contradictoryEvidenceCount:p.contradictoryEvidence.length,alternatives:['Unrecorded circumstances or differences between events may explain this association.','Self-reported records do not cover everything that happened.'],suggestedNextStep:'Record the next comparable event, including an outcome that does not fit.',reopenEligible:Boolean(p.suppression?.reopenEligible)};
}
async function checkStamp(stamp){
  if(!stamp)return;
  if(!capability.enabled()&&stamp.patterns.length)throw scopeError('Pattern access changed. Retry.',409);
  await evidence.assertEpoch(stamp.sourceEpoch);
  for(const ref of stamp.patterns){const p=await Pattern.findById(ref.id).lean();if(!p||p.revision!==ref.revision||!current(p,stamp.sourceEpoch)||p.state!=='active'||p.confidence!=='supported')throw scopeError('Pattern changed during guidance. Retry.',409);}
}
async function list({state='active',cursor,limit=20}={}){
  capability.requirePatternRead();
  if(!['active','candidate','disputed','dismissed','retired'].includes(state)||!Number.isInteger(limit)||limit<1||limit>25||(cursor&&!/^[a-f\d]{24}$/.test(cursor)))throw scopeError('Invalid pattern page.',400);
  const epoch=await evidence.epoch();
  const rows=await Pattern.find({state,...(cursor?{_id:{$gt:cursor}}:{})}).sort({_id:1}).limit(limit+1).lean();
  const data=[];for(const p of rows.slice(0,limit))data.push(await dto(p,epoch));
  await evidence.assertEpoch(epoch);await checkRevisions(rows.slice(0,limit));capability.requirePatternRead();
  return {sourceEpoch:epoch,patterns:data,nextCursor:rows.length>limit?String(rows[limit-1]._id):null};
}
async function detail(id){
  capability.requirePatternRead();const epoch=await evidence.epoch(),p=await Pattern.findById(id).lean();
  if(!p)throw scopeError('Pattern not found.',404);
  const result=await dto(p,epoch);await evidence.assertEpoch(epoch);await checkRevisions([p]);capability.requirePatternRead();return result;
}
async function evidencePage(id,{role='support',offset=0}={}){
  capability.requirePatternRead();if(!['support','contradiction'].includes(role)||!Number.isInteger(offset)||offset<0||offset>1200)throw scopeError('Invalid evidence page.',400);
  const epoch=await evidence.epoch(),p=await Pattern.findById(id).lean();if(!p)throw scopeError('Pattern not found.',404);
  if(!current(p,epoch))throw scopeError('Evidence changed. Reevaluate this pattern.',409);
  const refs=role==='support'?p.supportingEvidence:p.contradictoryEvidence;const entries=await evidence.resolveRefs(refs.slice(offset,offset+25));await evidence.assertEpoch(epoch);await checkRevisions([p]);capability.requirePatternRead();return {entries,total:refs.length,nextOffset:offset+25<refs.length?offset+25:null};
}
async function getPatternContext({purpose='mentor',limit=5}={}){
  if(!['mentor','planner','recommend'].includes(purpose))throw scopeError('Invalid pattern consumer.',400);
  const epoch=await evidence.epoch();
  if(!capability.enabled())return {sourceEpoch:epoch,patterns:[],unavailableReasons:['CAPABILITY_DISABLED']};
  const rows=await Pattern.find({state:'active',confidence:'supported',freshness:'current',evaluatedSourceEpoch:epoch,validUntil:{$gt:new Date()}}).sort({updatedAt:-1}).limit(Math.min(limit,5)).lean();
  const patterns=[];for(const p of rows)patterns.push(await dto(p,epoch));
  const result={sourceEpoch:epoch,patterns,unavailableReasons:[]};await checkStamp(result);return result;
}
async function planPreview(){
  if(require('./reasoningCapabilityService').enabled())return require('./reasoningService').preview();
  capability.requirePatternRead();const patternContext=await getPatternContext({purpose:'planner'}),core=require('./coreContextService');
  const context=await core.getContext(),tasks=await core.listTasks({status:'open'});await checkStamp(patternContext);
  return {patternContext,goals:context.goals||[],suggestions:tasks.slice(0,3).map(t=>({taskId:t._id,description:t.description})),execution:'disabled',message:'A draft for your review. No tasks or actions were created.'};
}
module.exports={list,detail,evidencePage,getPatternContext,checkStamp,planPreview};
