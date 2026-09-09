const crypto=require('node:crypto');
const Pattern=require('../models/Pattern');
const core=require('./coreContextService');
const evidence=require('./patternEvidenceService');
const capability=require('./patternCapabilityService');
const {scopeError,requireCoreScope,rejectOwnerFields}=require('./coreScopeService');
const {normalizeRule,semanticKey,evaluateRule,stable,counts,DAY}=require('../logic/patternRules');
const busy=new Set();
const hypothesis=rule=>{
  const predicate=p=>`${p.key} ${p.op==='eq'?'was recorded as':p.op} ${JSON.stringify(p.value)}`;
  const condition=rule.conditions.length?' when '+rule.conditions.map(predicate).join(' and '):'';
  const descriptions={recurrence:()=>`${rule.subjectKey}: ${predicate(rule.outcome)}${condition}.`,sequence:()=>`${rule.subjectKey}: ${predicate(rule.antecedent)} was recorded before ${predicate(rule.outcome)}${condition}.`,goal_action_consistency:()=>`${rule.subjectKey}: ${rule.direction==='completed_as_intended'?'completion by the intended deadline':'recorded noncompletion by the intended deadline'}.`,intervention_response:()=>`${rule.subjectKey}: ${rule.metricKey} (${rule.unit}) ${rule.direction} following recorded interventions; minimum comparison change ${rule.minimumDelta}.`};
  return descriptions[rule.family]().slice(0,1000);
};
function defaultRules(events){
  const rules=new Map();
  for(const e of events.filter(e=>e.eligible&&!e.task&&!e.phase&&!e.coverage)){
    for(const [key,value]of Object.entries(e.values).filter(([,v])=>typeof v==='boolean')){
      const rule=normalizeRule({family:'recurrence',domain:e.domain,subjectKey:e.subject,conditions:[],outcome:{key,op:'eq',value}});
      rules.set(stable(rule),rule);
    }
  }
  return [...rules.values()];
}
async function evaluate(payload={}){
  rejectOwnerFields(payload);
  require('../logic/patternRules').exact(payload,['rules','expectedSourceEpoch']);
  capability.requirePatternWrite();await capability.recheckSession();await evidence.prerequisites();
  const secret=process.env.PATTERN_HYPOTHESIS_HMAC_KEY;
  if(!secret||secret.length<32)throw scopeError('Pattern identity key is unavailable.',503);
  const identityKeyVersion=crypto.createHmac('sha256',secret).update('pattern-identity-key-version').digest('hex');
  const owner=requireCoreScope().userId;
  if(busy.has(owner))throw scopeError('A pattern evaluation is already running.',409);
  busy.add(owner);
  try {
    const now=Date.now(),snapshot=await evidence.snapshot(now);
    if(!snapshot.complete)throw scopeError('The evidence window exceeds the reviewed capacity. No classification was promoted; review a bounded methodology before continuing.',429);
    if(snapshot.patterns.some(p=>p.identityKeyVersion&&p.identityKeyVersion!==identityKeyVersion))throw scopeError('Pattern identity key changed. Reviewed key compatibility is required before evaluation.',503);
    if(snapshot.life?.lastPatternEvaluationAt&&now-+new Date(snapshot.life.lastPatternEvaluationAt)<60000)throw scopeError('Wait one minute between evaluations.',429);
    if(payload.expectedSourceEpoch!==undefined&&payload.expectedSourceEpoch!==snapshot.sourceEpoch)throw scopeError('Evidence changed. Reload.',409);
    if(snapshot.patterns.some(p=>p.evaluatedAt&&now-+new Date(p.evaluatedAt)<60000))throw scopeError('Wait one minute between evaluations.',429);
    const proposed=payload.rules===undefined?defaultRules(snapshot.events):payload.rules;
    if(!Array.isArray(proposed)||proposed.length>20)throw scopeError('At most twenty rules can be evaluated.',429);
    const rules=proposed.map(normalizeRule);
    if(payload.rules===undefined)for(const p of snapshot.patterns)if(p.rule&&!rules.some(r=>semanticKey(r,process.env.PATTERN_HYPOTHESIS_HMAC_KEY)===p.hypothesisKey))rules.push(p.rule);
    if(rules.length>20)throw scopeError('Choose a smaller explicit set of hypotheses for review.',429);
    const unique=new Map(rules.map(r=>[semanticKey(r,process.env.PATTERN_HYPOTHESIS_HMAC_KEY),normalizeRule(r)]));
    if(snapshot.patterns.length+[...unique.keys()].filter(k=>!snapshot.patterns.some(p=>p.hypothesisKey===k)).length>50)throw scopeError('Pattern capacity reached; no dismissed history was evicted.',429);
    const results=[];
    for(const [identity,rule]of unique){
      if(rule.goalId&&!snapshot.life?.goals?.some(g=>String(g._id)===rule.goalId))throw scopeError('Goal not found.',404);
      const prior=snapshot.patterns.find(p=>p.hypothesisKey===identity)||{};
      // A different methodology requires review, never silently rewrite it.
      if(prior.rule&&stable(prior.rule)!==stable(rule))throw scopeError('Existing hypothesis methodology is locked.',409);
      const evaluated=evaluateRule(rule,snapshot.events,prior,now,snapshot.complete);
      if(evaluated.episodes.length>400)throw scopeError('This hypothesis exceeds the 400-episode review limit. No partial sample was promoted.',429);
      const byRole=role=>[...new Map(evaluated.episodes.filter(e=>e.verdict===role).flatMap(e=>e.refs).map(r=>[r.authority+':'+r.recordId,r])).values()];
      const supportingEvidence=byRole('support'),contradictoryEvidence=byRole('contradiction');
      const update={...evaluated,identityKeyVersion,domain:rule.domain,family:rule.family,hypothesis:hypothesis(rule),hypothesisKey:identity,supportingEvidence,contradictoryEvidence,contextEvidence:[],evaluatedAt:new Date(now),evaluatedSourceEpoch:snapshot.sourceEpoch,contradictionReview:{...evaluated.contradictionReview,sourceEpoch:snapshot.sourceEpoch}};
      update.relatedDomains=rule.relatedDomains;update.proposalOrigin=prior.proposalOrigin||(payload.rules?'user_hypothesis':'deterministic');
      if(prior.state==='dismissed'){
        const after=+new Date(prior.suppression?.dismissedAt||now);
        const newUnits=counts(evaluated.episodes.filter(e=>e.at>after&&e.recordedAt>after));
        update.suppression={...prior.suppression,reopenEligible:evaluated.confidence==='supported'&&newUnits.supportingUnits>=3&&newUnits.supportDates>=2};
      }
      if(evaluated.state==='retired'&&prior.state!=='retired')update.retirement={at:new Date(now),reasonCode:'insufficient_current_evidence'};
      update.evaluationDigest=crypto.createHash('sha256').update(stable({epoch:snapshot.sourceEpoch,rule,units:evaluated.episodes,state:update.state,confidence:update.confidence})).digest('hex');
      results.push({prior,update});
    }
    await core.withContextMutation(async life=>{
      capability.requirePatternWrite();await capability.recheckSession();
      if((life.patternEvidenceRevision||0)!==snapshot.sourceEpoch)throw scopeError('Evidence changed during evaluation.',409);
      if(life.lastPatternEvaluationAt&&now-+life.lastPatternEvaluationAt<60000)throw scopeError('Wait one minute between evaluations.',429);
      life.lastPatternEvaluationAt=new Date(now);await life.save();
      for(const {prior,update}of results){
        const current=await Pattern.findOne({hypothesisKey:update.hypothesisKey});
        if((current?.revision||0)!==(prior.revision||0))throw scopeError('Pattern changed during evaluation.',409);
        if(current?.evaluationDigest===update.evaluationDigest&&current.freshness===update.freshness)continue;
        const p=current||new Pattern();p.set(update);p.revision=(current?.revision||0)+1;await p.save();
      }
    },{evidence:false});
    return {sourceEpoch:snapshot.sourceEpoch,evaluated:results.length,coverage:snapshot.complete?'complete':'incomplete'};
  }finally{busy.delete(owner);}
}
async function feedback(id,payload){
  capability.requirePatternWrite();rejectOwnerFields(payload);
  require('../logic/patternRules').exact(payload,['action','expectedRevision','requestId','comment']);
  if(!['agree','dispute','dismiss','retire','reopen'].includes(payload.action)||!/^[-a-zA-Z0-9]{8,80}$/.test(payload.requestId||'')||typeof(payload.comment||'')!=='string'||(payload.comment||'').length>1000)throw scopeError('Invalid feedback.',400);
  return core.withContextMutation(async()=>{
    capability.requirePatternWrite();await capability.recheckSession();
    const p=await Pattern.findById(id);if(!p)throw scopeError('Pattern not found.',404);
    const repeated=p.feedback.find(f=>f.requestId===payload.requestId);
    if(repeated){if(repeated.action!==payload.action||repeated.comment!==(payload.comment||''))throw scopeError('Feedback identity conflict.',409);return {id:p.id,revision:repeated.resultRevision};}
    if(p.revision!==payload.expectedRevision)throw scopeError('Pattern changed. Reload.',409);
    if(payload.action==='agree'&&p.freshness!=='current')throw scopeError('Reevaluate before agreeing with a pattern.',409);
    if(payload.action==='reopen'){
      if(!['dismissed','disputed','retired'].includes(p.state)||!p.rule)throw scopeError('Record a new hypothesis after source deletion.',409);
      p.state='candidate';p.confidence='insufficient';p.freshness='stale';p.prospectivelyConfirmed=false;p.observationWindow.discoveryEnd=null;
    }
    if(payload.action==='dispute')p.state='disputed';
    if(payload.action==='dismiss'){p.state='dismissed';p.suppression={dismissedAt:new Date(),lastEventAt:new Date(),reopenEligible:false};}
    if(payload.action==='retire'){p.state='retired';p.retirement={at:new Date(),reasonCode:'user_retired'};}
    p.feedback.push({requestId:payload.requestId,action:payload.action,comment:payload.comment||'',at:new Date(),priorRevision:p.revision,resultRevision:p.revision+1});p.feedback=p.feedback.slice(-20);p.revision++;await p.save();
    return {id:p.id,revision:p.revision,state:p.state};
  },{evidence:false});
}
module.exports={evaluate,feedback,defaultRules};
