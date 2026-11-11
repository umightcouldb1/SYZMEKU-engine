const {test}=require('node:test');const assert=require('node:assert/strict');
const {authVersionOf,isSessionCurrent}=require('../utils/sessionVersion');
test('version zero keeps legacy sessions valid until an explicit per-account upgrade',()=>{
 assert.equal(authVersionOf({}),0);assert(isSessionCurrent({},{}));assert(isSessionCurrent({authVersion:0},{},undefined));
 assert(!isSessionCurrent({authVersion:1},{},undefined));assert(!isSessionCurrent({authVersion:1},{authVersion:0},0));assert(isSessionCurrent({authVersion:1},{authVersion:1},1));assert(!isSessionCurrent({authVersion:1},{authVersion:1},0));assert(!isSessionCurrent({authVersion:1},{authVersion:1},undefined));
});
test('malformed version values fail closed without coercion',()=>{
 for(const v of [null,-1,0.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>authVersionOf({authVersion:v}));assert(!isSessionCurrent({authVersion:v},{authVersion:v},v));}
});

test('hydrating and saving a legacy user does not materialize a stale version zero',()=>{
 const User=require('../models/User');const user=User.hydrate({_id:new (require('mongoose').Types.ObjectId)(),name:'Legacy',username:'legacy',email:'legacy@example.test',password:'fixture'});assert.equal(user.authVersion,undefined);user.name='Renamed';const delta=user.$__delta();assert(!Object.hasOwn(delta[1].$set||{},'authVersion'));
});
