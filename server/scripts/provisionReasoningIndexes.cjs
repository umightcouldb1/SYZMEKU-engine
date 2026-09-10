// Review-only plan. This implementation approval does not authorize production DDL.
const {INDEXES}=require('../services/reasoningPersistenceService');
if(process.argv.includes('--apply')){console.error('Production index application requires a separate reviewed release; this command only prints the plan.');process.exitCode=1;}
else console.log(JSON.stringify({apply:false,collection:'reasoningrecords',autoCreate:false,autoIndex:false,proposedIndexes:INDEXES,sourceRecordsChanged:0},null,2));
