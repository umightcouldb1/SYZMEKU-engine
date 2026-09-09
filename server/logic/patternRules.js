const crypto = require('node:crypto');
const DAY = 86400000;
// Registry entries are immutable methodologies. Never fit a window to the result.
const METHODS = Object.freeze({ 'pattern-rules-v1': Object.freeze({ windowDays: 28, confirmationDays: 14, minimumConfirmationDays: 7, minimumUnits: 3, minimumDates: 2, horizonHours: 24, maximumSources: 500, maximumPatterns: 50, maximumRules: 20 }) });
const FAMILIES = ['recurrence', 'sequence', 'goal_action_consistency', 'intervention_response'];
const keyPattern = /^[a-z][a-z0-9_-]{0,79}$/;
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const exact = (object, keys) => { if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !keys.includes(k))) fail('Unsupported pattern field.'); };
const key = value => { if (typeof value !== 'string' || !keyPattern.test(value)) fail('Use a registered-style lower-case key.'); return value; };
const scalar = value => { if (!['string','number','boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)) || String(value).length > 100) fail('Invalid typed value.'); return value; };
const stable = value => JSON.stringify(value, function(k,v) { return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? Object.fromEntries(Object.keys(v).sort().map(x=>[x,v[x]])) : v; });
function normalizeRule(input) {
  exact(input, ['family','domain','relatedDomains','subjectKey','conditions','outcome','antecedent','direction','metricKey','unit','minimumDelta','goalId','methodVersion','windowDays']);
  const methodVersion = input.methodVersion || 'pattern-rules-v1', method = METHODS[methodVersion];
  if (!method) fail('Unknown pattern method.');
  if (!FAMILIES.includes(input.family)) fail('Unknown pattern family.');
  if (input.windowDays !== undefined && input.windowDays !== method.windowDays) fail('Window is not approved for this method.');
  const conditions = input.conditions || [];
  if (!Array.isArray(conditions) || conditions.length > 8) fail('Too many predicates.');
  const predicate = p => {
    exact(p,['key','op','value']); key(p.key);
    if (!['eq','in','gte','lte'].includes(p.op)) fail('Unsupported predicate.');
    if (p.op === 'in') { if (!Array.isArray(p.value) || !p.value.length || p.value.length > 10) fail('Invalid enum predicate.'); p.value.forEach(scalar); }
    else scalar(p.value);
    if (['gte','lte'].includes(p.op) && typeof p.value !== 'number') fail('Numeric predicate required.');
    return {key:p.key,op:p.op,value:Array.isArray(p.value)?[...new Set(p.value)].sort():p.value};
  };
  const rule = {family:input.family,domain:key(input.domain),subjectKey:key(input.subjectKey),conditions:conditions.map(predicate).sort((a,b)=>stable(a).localeCompare(stable(b))),methodVersion,windowDays:method.windowDays};
  if(input.relatedDomains!==undefined&&(!Array.isArray(input.relatedDomains)||input.relatedDomains.length>4))fail('At most four related domains are supported.');
  rule.relatedDomains=[...new Set((input.relatedDomains||[]).map(key).filter(d=>d!==rule.domain))].sort();
  if (new Set(rule.conditions.map(p=>p.key)).size !== rule.conditions.length) fail('Duplicate condition key.');
  if (['recurrence','sequence'].includes(rule.family)) rule.outcome = predicate(input.outcome);
  if (rule.family === 'sequence') rule.antecedent = predicate(input.antecedent);
  if (rule.family === 'goal_action_consistency') {
    if (!/^[a-f\d]{24}$/i.test(input.goalId || '')) fail('An owned goal is required.');
    if (!['completed_as_intended','recorded_not_completed_as_intended'].includes(input.direction)) fail('Invalid intention direction.');
    rule.goalId=input.goalId.toLowerCase();rule.direction=input.direction;
  }
  if (rule.family === 'intervention_response') {
    rule.metricKey=key(input.metricKey);rule.unit=key(input.unit);
    if (!['increase','decrease','unchanged'].includes(input.direction) || !Number.isFinite(input.minimumDelta) || input.minimumDelta <= 0) fail('Intervention requires a direction and positive minimum delta.');
    rule.direction=input.direction;rule.minimumDelta=input.minimumDelta;
  }
  return rule;
}
function semanticKey(rule, secret) {
  if (!secret || secret.length < 32) throw Object.assign(new Error('Pattern identity key is unavailable.'), {statusCode:503});
  const {methodVersion,windowDays,...semantics}=normalizeRule(rule);
  return crypto.createHmac('sha256',secret).update(stable(semantics)).digest('hex');
}
const date = value => new Date(value).toISOString().slice(0,10);
function matches(p, values) {
  const v=values[p.key];
  if (v === undefined || v === null) return null;
  if (p.op==='eq') return typeof v===typeof p.value ? v===p.value : null;
  if (p.op==='in') return p.value.some(x=>typeof x===typeof v) ? p.value.includes(v) : null;
  return typeof v==='number' ? (p.op==='gte'?v>=p.value:v<=p.value) : null;
}
function deduplicate(events) {
  const roots=new Set(), fingerprints=new Set(), result=[];let duplicates=0;
  for (const e of [...events].sort((a,b)=>a.recordedAt-b.recordedAt || a.id.localeCompare(b.id))) {
    if (!e.root || !e.eligible) continue;
    const fingerprint=stable({subject:e.subject,domain:e.domain,time:e.at,values:e.values,phase:e.phase,interventionKey:e.interventionKey});
    if (roots.has(e.root) || fingerprints.has(fingerprint)) {duplicates++;continue;}
    roots.add(e.root);fingerprints.add(fingerprint);result.push(e);
  }
  return {events:result.sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id)),duplicates};
}
function classify(rule, events, start, end) {
  const selected=events.filter(e=>e.at>=start && e.at<=end && [rule.domain,...rule.relatedDomains].includes(e.domain) && e.subject===rule.subjectKey && rule.conditions.every(p=>matches(p,e.values)===true));
  const units=[]; const used=new Set();
  const add=(event, verdict, refs=[event])=>units.push({episodeKey:event.root,at:event.at,recordedAt:Math.max(...refs.map(e=>e.recordedAt)),date:date(event.at),verdict,refs:refs.map(e=>e.ref)});
  if (rule.family==='recurrence') for(const e of selected) { const m=matches(rule.outcome,e.values);add(e,m===null?'unknown':m?'support':'contradiction'); }
  if (rule.family==='sequence') for(const a of selected) {
    if (used.has(a.id) || matches(rule.antecedent,a.values)!==true) continue;
    const b=selected.find(e=>!used.has(e.id) && e.at>a.at && e.at<=a.at+DAY && matches(rule.outcome,e.values)!==null && !e.coverage);
    if(b) {used.add(a.id);used.add(b.id);add(a,matches(rule.outcome,b.values)?'support':'contradiction',[a,b]);}
    else {const coverage=selected.find(e=>e.coverage?.complete && e.coverage.start<=a.at && e.coverage.end>=a.at+DAY && e.coverage.end<=end && matches(rule.outcome,e.values)===false);add(a,coverage?'contradiction':'unknown',coverage?[a,coverage]:[a]);}
  }
  if (rule.family==='goal_action_consistency') for(const e of selected.filter(e=>e.task && e.goalId===rule.goalId)) {
    const done=e.completedAt!==null && e.completedAt!==undefined;
    const report=selected.find(r=>r.taskRef===e.id && r.at>=e.dueAt && r.values.completed===false);
    if(!done&&!report) {add(e,'unknown');continue;}
    const onTime=done&&e.completedAt<=e.dueAt;
    const success=rule.direction==='completed_as_intended'?onTime:!onTime;
    add(e,success?'support':'contradiction',report?[e,report]:[e]);
  }
  if(rule.family==='intervention_response') for(const e of selected.filter(e=>e.phase==='intervention')) {
    const other=selected.some(x=>x.phase==='intervention' && x.id!==e.id && Math.abs(x.at-e.at)<2*DAY);
    const comparable=x=>x.interventionKey===e.interventionKey && x.unit===rule.unit && typeof x.values[rule.metricKey]==='number'&&!used.has(x.id);
    const before=selected.filter(x=>x.phase==='baseline'&&x.at<e.at&&x.at>=e.at-DAY&&comparable(x)).at(-1);
    const after=selected.find(x=>x.phase==='post'&&x.at>e.at&&x.at<=e.at+DAY&&comparable(x));
    if(other||!before||!after) {add(e,'unknown');continue;}
    used.add(before.id);used.add(after.id);
    const delta=after.values[rule.metricKey]-before.values[rule.metricKey];
    const success=rule.direction==='increase'?delta>=rule.minimumDelta:rule.direction==='decrease'?delta<=-rule.minimumDelta:Math.abs(delta)<rule.minimumDelta;
    add(e,success?'support':'contradiction',[before,e,after]);
  }
  return units;
}
const counts = units => ({supportingUnits:units.filter(e=>e.verdict==='support').length,contradictingUnits:units.filter(e=>e.verdict==='contradiction').length,unknownUnits:units.filter(e=>e.verdict==='unknown').length,supportDates:new Set(units.filter(e=>e.verdict==='support').map(e=>e.date)).size,contradictionDates:new Set(units.filter(e=>e.verdict==='contradiction').map(e=>e.date)).size,distinctSourceObservations:new Set(units.flatMap(e=>e.refs.map(r=>r.recordId))).size,eligibleUnits:units.length});
const minimum = c => c.supportingUnits>=3&&c.supportDates>=2;
const promotion = c => 3*c.contradictingUnits<=c.supportingUnits+c.contradictingUnits;
function evaluateRule(input, raw, prior={}, now=Date.now(), complete=true) {
  const rule=normalizeRule(input),method=METHODS[rule.methodVersion];
  const {events,duplicates}=deduplicate(raw);
  const start=now-rule.windowDays*DAY,units=classify(rule,events,start,now),c=counts(units);
  let confidence='insufficient',reasons=['NOT_ENOUGH_DISTINCT_EVIDENCE'];
  let discoveryEnd=prior.observationWindow?.discoveryEnd?+new Date(prior.observationWindow.discoveryEnd):null;
  let prospectivelyConfirmed=prior.prospectivelyConfirmed===true;
  if(complete&&minimum(c)) {confidence='tentative';reasons=['LATER_WINDOW_REQUIRED']; if(!discoveryEnd)discoveryEnd=now;}
  const confirmationStart=discoveryEnd ? Date.parse(date(discoveryEnd))+DAY : null;
  const confirmationEnd=confirmationStart?confirmationStart+method.confirmationDays*DAY-1:null;
  const later=confirmationStart?classify(rule,events.filter(e=>e.recordedAt>discoveryEnd),confirmationStart,Math.min(now,confirmationEnd)):[];
  const laterCounts=counts(later);
  if(complete&&minimum(c)&&promotion(c)) {
    if(prospectivelyConfirmed || (now>=confirmationStart+method.minimumConfirmationDays*DAY&&minimum(laterCounts)&&promotion(laterCounts))) {
      confidence='supported';reasons=['LATER_WINDOW_CONFIRMED','CONTRADICTIONS_REVIEWED'];prospectivelyConfirmed=true;
    }
  }
  if(complete&&minimum(c)&&(!promotion(c)||(minimum(laterCounts)&&!promotion(laterCounts))))reasons=['MIXED_RECORDED_EVIDENCE'];
  if(!complete)reasons=['INCOMPLETE_EVIDENCE_SCAN'];
  let state=prior.state||'candidate';
  if(!['disputed','dismissed','retired'].includes(state)) {
    if(confidence==='supported')state='active';
    else if(state==='active'&&confidence==='tentative')state='disputed';
    else if(state==='active'&&confidence==='insufficient'&&complete)state='retired';
  }
  // The confidence method is locked. No rolling failure declares the hypothesis false.
  const expiry=Math.min(now+DAY,...units.map(e=>e.at+rule.windowDays*DAY+1).filter(t=>t>now));
  return {rule,methodVersion:rule.methodVersion,counts:{...c,duplicateGroupsExcluded:duplicates},confidence,confidenceReasons:reasons,state,prospectivelyConfirmed,episodes:units,observationWindow:{start:new Date(start),end:new Date(now),windowDays:rule.windowDays,timezone:'UTC',discoveryEnd:discoveryEnd?new Date(discoveryEnd):null,confirmationStart:confirmationStart?new Date(confirmationStart):null,confirmationEnd:confirmationEnd?new Date(confirmationEnd):null},validUntil:new Date(expiry),coverage:{status:complete?'complete':'incomplete',examinedCount:raw.length,excludedCount:raw.filter(e=>!e.eligible).length},contradictionReview:{reviewedAt:new Date(now),methodVersion:rule.methodVersion,coverageComplete:complete},freshness:complete?'current':'stale'};
}
module.exports={DAY,METHODS,FAMILIES,normalizeRule,semanticKey,stable,matches,deduplicate,classify,counts,evaluateRule,exact,key,scalar};
