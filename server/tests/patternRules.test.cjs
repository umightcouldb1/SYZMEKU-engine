const {test}=require('node:test');const assert=require('node:assert/strict');
const {DAY,evaluateRule,normalizeRule,deduplicate,semanticKey,METHODS}=require('../logic/patternRules');
const now=Date.UTC(2026,8,1),goal='123456789012345678901234';
const rule={family:'recurrence',domain:'business',subjectKey:'work',conditions:[],outcome:{key:'completed',op:'eq',value:true}};
function event(id,days,value=true,extra={}){return {id:String(id),root:'event:'+id,at:now+days*DAY,recordedAt:now+days*DAY,eligible:true,domain:'business',subject:'work',values:{completed:value},ref:{authority:'SignalEntry',recordId:String(id),sourceRevision:1},...extra};}
const initial=[event(1,-3),event(2,-2),event(3,-1)];
test('versioned windows are defaults, not fitted per hypothesis',()=>{assert.equal(normalizeRule(rule).windowDays,28);assert.throws(()=>normalizeRule({...rule,windowDays:7}),/approved/);assert.throws(()=>normalizeRule({...rule,methodVersion:'unknown'}),/Unknown/);assert(Object.isFrozen(METHODS['pattern-rules-v1']));});
for(const [name,events,confidence]of [['one',[event(1,-1)],'insufficient'],['two',initial.slice(0,2),'insufficient'],['three same date',[event(1,-1),event(2,-1,true,{at:now-DAY+1000}),event(3,-1,true,{at:now-DAY+2000})],'insufficient'],['three distinct dates',initial,'tentative']])test(name+' never implies support',()=>{assert.equal(evaluateRule(rule,events,{},now).confidence,confidence);});
test('root aliases, exact duplicate copies and model outputs add no independent evidence',()=>{const a=initial[0];const copies=[a,{...a,id:'copy'},{...a,id:'different-root',root:'other'},{...initial[1],eligible:false}];assert.equal(deduplicate(copies).events.length,1);assert.equal(evaluateRule(rule,copies,{},now).confidence,'insufficient');});
test('missing values and type mismatch remain unknown, not false',()=>{const value=evaluateRule(rule,[event(1,-1,true,{values:{}}),event(2,-2,true,{values:{completed:0}})],{},now);assert.equal(value.counts.contradictingUnits,0);assert.equal(value.counts.unknownUnits,2);});
test('supported requires later recorded observations, two dates and seven days',()=>{
 const prior=evaluateRule(rule,initial,{},now);const later=[event(4,2),event(5,3),event(6,4)];
 assert.equal(evaluateRule(rule,[...initial,...later],prior,now+5*DAY).confidence,'tentative');
 assert.equal(evaluateRule(rule,[...initial,...later],prior,now+8*DAY).confidence,'supported');
 assert.equal(evaluateRule(rule,[...initial,...later.map(e=>({...e,recordedAt:now-DAY}))],prior,now+8*DAY).confidence,'tentative');
 assert.equal(evaluateRule(rule,[...initial,...later],prior,now+8*DAY,false).confidence,'insufficient');
});
test('contradiction ceiling prevents promotion without declaring a hypothesis false',()=>{const p=evaluateRule(rule,initial,{},now);const e=[...initial,event(4,2),event(5,3),event(6,4),event(7,5,false),event(8,6,false)];const v=evaluateRule(rule,e,p,now+8*DAY);assert.equal(v.confidence,'tentative');assert(v.confidenceReasons.includes('MIXED_RECORDED_EVIDENCE'));assert.equal(v.counts.contradictingUnits,2);});
test('supported pattern loses stale evidence after the maintenance window',()=>{const p={...evaluateRule(rule,initial,{},now),state:'active',prospectivelyConfirmed:true};assert.equal(evaluateRule(rule,initial,p,now+40*DAY).state,'retired');});
test('dismissal and disagreement are not evidence or automatic activation',()=>{for(const state of ['dismissed','disputed','retired'])assert.equal(evaluateRule(rule,initial,{state,prospectivelyConfirmed:true},now).state,state);});
test('semantic suppression key ignores method wording and canonicalizes predicate order',()=>{const s='fixture-only-key-32-characters-long';const a={...rule,conditions:[{key:'place',op:'eq',value:'desk'},{key:'interruptions',op:'eq',value:false}]};assert.equal(semanticKey(a,s),semanticKey({...a,conditions:[...a.conditions].reverse()},s));assert.throws(()=>semanticKey(rule,''),/unavailable/);});
for(const [name,patch]of [['unknown family',{family:'diagnosis'}],['script predicate',{conditions:[{key:'x',op:'eval',value:'code'}]}],['foreign owner',{userId:goal}],['wild path',{outcome:{key:'$where',op:'eq',value:true}}]])test('reject '+name,()=>assert.throws(()=>normalizeRule({...rule,...patch})));
test('sequence counts nonoverlapping episodes, not underlying records',()=>{
 const r={...rule,family:'sequence',antecedent:{key:'started',op:'eq',value:true}};
 const events=initial.flatMap((e,i)=>[{...e,values:{started:true}},event('b'+i,i-3,true,{at:e.at+1000})]);
 const v=evaluateRule(r,events,{},now);assert.equal(v.counts.supportingUnits,3);assert.equal(v.counts.distinctSourceObservations,6);
 assert.equal(evaluateRule(r,[event(1,-2,true,{values:{started:true}})],{},now).counts.contradictingUnits,0);
});
test('sequence absence needs explicit completed coverage and ordering',()=>{const r={...rule,family:'sequence',antecedent:{key:'started',op:'eq',value:true}};const a=event(1,-2,true,{values:{started:true}});const b=event(2,-1,false,{coverage:{start:a.at,end:a.at+DAY,complete:true}});assert.equal(evaluateRule(r,[a,b],{},now).counts.contradictingUnits,1);assert.equal(evaluateRule(r,[a,{...b,coverage:null,at:a.at}],{},now).counts.supportingUnits,0);});
test('open task without explicit outcome is unknown; deadline is not a character judgment',()=>{
 const r={family:'goal_action_consistency',domain:'business',subjectKey:'work',conditions:[],goalId:goal,direction:'completed_as_intended'};
 const t=event(1,-2,true,{task:true,goalId:goal,dueAt:now-2*DAY,completedAt:null});assert.equal(evaluateRule(r,[t],{},now).counts.unknownUnits,1);
 assert.equal(evaluateRule(r,[{...t,completedAt:t.dueAt-1000}],{},now).counts.supportingUnits,1);
 assert.equal(evaluateRule(r,[{...t,completedAt:t.dueAt+1000}],{},now).counts.contradictingUnits,1);
});
test('intervention compares paired measures and excludes overlap, missing baseline and unit mismatch',()=>{
 const r={family:'intervention_response',domain:'business',subjectKey:'work',metricKey:'minutes',unit:'minutes',direction:'decrease',minimumDelta:5};
 const baseline=event(1,-3,true,{phase:'baseline',interventionKey:'a',unit:'minutes',values:{minutes:30}}),action=event(2,-2.5,true,{phase:'intervention',interventionKey:'a',unit:'minutes',values:{}}),post=event(3,-2,true,{phase:'post',interventionKey:'a',unit:'minutes',values:{minutes:20}});
 assert.equal(evaluateRule(r,[baseline,action,post],{},now).counts.supportingUnits,1);
 assert.equal(evaluateRule(r,[action,post],{},now).counts.unknownUnits,1);
 assert.equal(evaluateRule(r,[baseline,action,{...post,unit:'hours'}],{},now).counts.supportingUnits,0);
 assert.equal(evaluateRule(r,[baseline,action,post,{...action,id:'other',root:'other',at:action.at+1000}],{},now).counts.supportingUnits,0);
});
test('cross-domain sequences require explicitly approved domains and comparable recorded subjects',()=>{
 const r={...rule,family:'sequence',relatedDomains:['learning'],antecedent:{key:'started',op:'eq',value:true}};
 const a=event(1,-2,true,{values:{started:true}}),b=event(2,-2,true,{domain:'learning',at:a.at+1000});
 assert.equal(evaluateRule(r,[a,b],{},now).counts.supportingUnits,1);
 assert.equal(evaluateRule({...r,relatedDomains:[]},[a,b],{},now).counts.supportingUnits,0);
 assert.equal(evaluateRule(r,[a,{...b,subject:'unrelated'}],{},now).counts.supportingUnits,0);
});
test('contradiction promotion boundary uses integers; stale maintenance demotes but never proves false',()=>{
 const prior={...evaluateRule(rule,initial,{},now),prospectivelyConfirmed:true,state:'active'};
 const boundary=evaluateRule(rule,[...initial,event(4,-4,false)],prior,now);assert.equal(boundary.confidence,'supported');
 const mixed=evaluateRule(rule,[...initial,event(4,-4,false),event(5,-5,false)],prior,now);assert.equal(mixed.confidence,'tentative');assert.equal(mixed.state,'disputed');
});
