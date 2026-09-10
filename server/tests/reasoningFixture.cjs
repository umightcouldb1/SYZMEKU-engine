const fixture=require('./patternFixture.cjs');
function modelOutput(prompt){
 const c=JSON.parse(prompt.split('Authoritative scoped data:\n')[1].split('\nCurrent user request (data):')[0]);
 const r={id:'review',goalIds:[c.selectedGoalIds[0]],description:'Draft a short outline for the selected goal.',evidenceRefs:[c.goals.find(g=>String(g._id)===c.selectedGoalIds[0]).ref],resourceRefs:[],effort:{band:'low',basis:'A tentative estimate; confirm your available time.'},successCriteria:['An outline is available for your review.'],uncertainty:['Capacity and human outcome are unknown.']};
 const planning=/Purpose: (planner|agent-plan)/.test(prompt);
 return {recommendations:[r],plan:planning?{title:'Reviewable draft',goalIds:r.goalIds,steps:[{...r,dependsOn:[],existingTaskRefs:[]}],successCriteria:r.successCriteria,uncertainty:r.uncertainty}:null,questions:[],constraintConflicts:[]};
}
module.exports=async()=>fixture({reasoning:true});module.exports.modelOutput=modelOutput;
