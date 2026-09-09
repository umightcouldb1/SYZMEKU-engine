const mongoose=require('mongoose');
const {FAMILIES}=require('../logic/patternRules');
const {Schema}=mongoose;
const sub=fields=>new Schema(fields,{_id:false,strict:'throw'});
const ref=sub({authority:{type:String,enum:['SignalEntry','Task','LifeContext','StrategicMemory','Memory','ActionExecution','KernelCycle','SystemExecution','ProtocolExecutionRecord'],required:true},recordId:{type:String,required:true},itemId:String,sourceRevision:{type:Number,required:true},originRootKey:String,occurredAt:Date,recordedAt:Date});
const predicate=sub({key:String,op:{type:String,enum:['eq','in','gte','lte']},value:Schema.Types.Mixed});
const rule=sub({family:{type:String,enum:FAMILIES},domain:String,relatedDomains:[String],subjectKey:String,conditions:[predicate],outcome:predicate,antecedent:predicate,direction:String,metricKey:String,unit:String,minimumDelta:Number,goalId:String,methodVersion:String,windowDays:Number});
const schema=new Schema({
  schemaVersion:{type:Number,default:1},revision:{type:Number,default:1},domain:{type:String,required:true,maxlength:80},family:{type:String,enum:FAMILIES,required:true},
  identityKeyVersion:String,
  relatedDomains:[String],proposalOrigin:{type:String,enum:['deterministic','user_hypothesis'],default:'deterministic'},
  hypothesis:{type:String,maxlength:1000},hypothesisKey:{type:String,required:true},rule:{type:rule,default:null},methodVersion:{type:String,required:true},
  supportingEvidence:[ref],contradictoryEvidence:[ref],contextEvidence:[ref],
  episodes:[sub({episodeKey:String,at:Number,recordedAt:Number,date:String,verdict:{type:String,enum:['support','contradiction','unknown']},refs:[ref]})],
  observationWindow:sub({start:Date,end:Date,windowDays:Number,timezone:String,discoveryEnd:Date,confirmationStart:Date,confirmationEnd:Date}),
  counts:sub({supportingUnits:Number,contradictingUnits:Number,unknownUnits:Number,supportDates:Number,contradictionDates:Number,distinctSourceObservations:Number,eligibleUnits:Number,duplicateGroupsExcluded:Number}),
  confidence:{type:String,enum:['insufficient','tentative','supported'],default:'insufficient'},confidenceReasons:[String],
  coverage:sub({status:{type:String,enum:['complete','incomplete','unavailable']},examinedCount:Number,excludedCount:Number}),
  contradictionReview:sub({reviewedAt:Date,methodVersion:String,sourceEpoch:Number,coverageComplete:Boolean}),
  state:{type:String,enum:['candidate','active','disputed','dismissed','retired'],default:'candidate'},freshness:{type:String,enum:['current','stale'],default:'stale'},
  prospectivelyConfirmed:{type:Boolean,default:false},evaluatedSourceEpoch:Number,evaluatedAt:Date,validUntil:Date,evaluationDigest:String,
  feedback:{type:[sub({requestId:String,action:String,comment:{type:String,maxlength:1000},at:Date,priorRevision:Number,resultRevision:Number})],default:[]},
  suppression:sub({dismissedAt:Date,lastEventAt:Date,reopenEligible:Boolean}),invalidation:sub({at:Date,reasonCode:String}),retirement:sub({at:Date,reasonCode:String}),
},{timestamps:true,strict:'throw',autoCreate:false});
schema.plugin(require('./coreOwned'),{ownerKey:'userId'});
schema.index({userId:1,hypothesisKey:1},{unique:true,name:'pattern_owner_hypothesis_uq'});
schema.index({userId:1,state:1,updatedAt:-1},{name:'pattern_owner_state_updated'});
schema.pre('validate',async function(){
  if(this.feedback.length>20||this.episodes.length>400||this.supportingEvidence.length+this.contradictoryEvidence.length+this.contextEvidence.length>1200)throw new Error('Pattern capacity exceeded.');
  for(const r of [...this.supportingEvidence,...this.contradictoryEvidence,...this.contextEvidence]){
    if(!['SignalEntry','Task','LifeContext','StrategicMemory','Memory','ActionExecution','KernelCycle','SystemExecution','ProtocolExecutionRecord'].includes(r.authority))throw Object.assign(new Error('Unknown evidence authority.'),{statusCode:400});
    if(!/^[a-f\d]{24}$/i.test(r.recordId)||!await require('./'+r.authority).exists({_id:r.recordId}))throw Object.assign(new Error('Referenced evidence is not accessible in this scope.'),{statusCode:404});
  }
  if(this.rule?.goalId){const life=await require('./LifeContext').findOne().lean();if(!life?.goals?.some(g=>String(g._id)===this.rule.goalId))throw Object.assign(new Error('Goal is not accessible in this scope.'),{statusCode:404});}
});
// Application mutations must use the internal transaction path, including privacy
// maintenance while the presentation capability is disabled.
schema.pre(['save','updateOne','updateMany','findOneAndUpdate','deleteMany','deleteOne'],function(){
  const context=require('../utils/requestContext').getRequestContext();
  if(!context.coreTransaction)throw Object.assign(new Error('Pattern mutation requires a context transaction.'),{statusCode:403});
  if(!context.patternMaintenance)require('../services/patternCapabilityService').requirePatternWrite();
});
module.exports=mongoose.model('Pattern',schema);
