const {Schema}=require('mongoose');
const options={_id:false,strict:'throw'};
const provenance=new Schema({kind:{type:String,enum:['user_event','user_report','system_event','derived','unknown'],default:'unknown'},originRootKey:String,recordedVia:String},options);
const event=new Schema({subjectKey:String,values:{type:Map,of:Schema.Types.Mixed},unit:String,interventionKey:String,phase:{type:String,enum:['intervention','baseline','post']},coverage:new Schema({start:Date,end:Date,complete:Boolean},options),taskRef:String},options);
const intent=new Schema({dueAt:Date,confirmedAt:Date,subjectKey:String,evaluationKey:String},options);
module.exports={provenance,event,intent};
