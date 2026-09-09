const {test}=require('node:test');const assert=require('node:assert/strict');
const {inventorySnapshot,report,main}=require('../scripts/migrateCoreContextV1.cjs');
const fixture={userIds:['000000000000000000000001'],collections:{strategicmemories:[{_id:'unowned',content:'never-in-report'},{_id:'owned',userId:'000000000000000000000001'},{_id:'orphan',userId:'000000000000000000000002'},{_id:'invalid',userId:'founder'}],tasks:[{_id:'task',userId:'000000000000000000000001'}]}};
test('dry-run reports unresolved owners without guessing or exposing content',()=>{
 const output=report(inventorySnapshot(fixture),'synthetic fixture');assert.equal(output.unresolvedOwnership,3);assert.equal(output.writes,0);assert.equal(output.ownershipAssignments,0);assert(!JSON.stringify(output).includes('never-in-report'));assert.deepEqual(inventorySnapshot(fixture),inventorySnapshot(fixture));
});
test('migration apply/backfill is not implemented',async()=>{await assert.rejects(()=>main(['--apply']),/no apply/);await assert.rejects(()=>main(['--backfill']),/no apply/);});
