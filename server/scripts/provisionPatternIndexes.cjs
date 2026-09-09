// This tool is never run by CI, app boot or HTTP. No production run is authorized
// by M2 implementation approval. Review output and obtain index approval first.
const mongoose=require('mongoose');const {INDEXES}=require('../services/patternEvidenceService');
async function provision(){
  const apply=process.argv.includes('--apply');const expected=process.argv.find(a=>a.startsWith('--database='))?.slice(11);
  if(!apply){console.log(JSON.stringify({apply:false,proposedIndexes:INDEXES},null,2));return;}
  if(!expected||!process.env.PATTERN_INDEX_URI||process.env.PATTERN_INDEX_APPROVED_DATABASE!==expected)throw new Error('Explicit URI, --database and matching approved database are required.');
  await mongoose.connect(process.env.PATTERN_INDEX_URI,{autoIndex:false,autoCreate:false});
  try{
    if(mongoose.connection.name!==expected)throw new Error('Database identity mismatch.');
    for(const spec of INDEXES){const collection=require('../models/'+spec.model).collection;const existing=await collection.indexes().catch(e=>{if(e.code===26)return [];throw e;});
      const collision=existing.find(i=>i.name===spec.name);if(collision&&(JSON.stringify(collision.key)!==JSON.stringify(spec.key)||Boolean(collision.unique)!==Boolean(spec.unique)))throw new Error('Index definition conflict; no drop or replacement is supported.');
    }
    for(const spec of INDEXES)await require('../models/'+spec.model).collection.createIndex(spec.key,{name:spec.name,...(spec.unique?{unique:true}:{})});
    console.log(JSON.stringify({database:expected,indexes:INDEXES.map(i=>i.name),sourceRecordsChanged:0}));
  }finally{await mongoose.disconnect();}
}
if(require.main===module)provision().catch(()=>{console.error('Index provisioning stopped. Check explicit approval, target identity and index definitions. No replacement/drop is attempted.');process.exitCode=1;});
module.exports=provision;
