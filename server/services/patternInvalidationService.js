const Pattern=require('../models/Pattern');
const {getRequestContext,runWithRequestContext}=require('../utils/requestContext');
const maintenance=callback=>runWithRequestContext({...getRequestContext(),patternMaintenance:true},callback);
async function stale(){await Pattern.updateMany({},{$set:{freshness:'stale'},$inc:{revision:1}});await require('./reasoningInvalidationService').stale();}
async function redact(reasonCode='source_revised'){
  await require('./reasoningInvalidationService').redact(reasonCode);
  // A conservative owner-wide scrub avoids retaining deleted wording in an
  // explanation, feedback comment or a hypothesis inferred from that wording.
  await Pattern.updateMany({},{$set:{freshness:'stale',hypothesis:'',rule:null,supportingEvidence:[],contradictoryEvidence:[],contextEvidence:[],episodes:[],feedback:[],invalidation:{at:new Date(),reasonCode},confidence:'insufficient'},$unset:{evaluationDigest:1,counts:1}});
  await Pattern.updateMany({state:{$ne:'dismissed'}},{$set:{state:'retired',retirement:{at:new Date(),reasonCode}}});
}
async function erase(){await Pattern.deleteMany({});await require('./reasoningInvalidationService').erase();}
module.exports={stale:()=>maintenance(stale),redact:reason=>maintenance(()=>redact(reason)),erase:()=>maintenance(erase)};
