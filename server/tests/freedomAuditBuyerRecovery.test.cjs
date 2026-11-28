const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const tests=[];
async function test(file,fixed){
 let latest=null,paid=true,calls=[],payloads=[],fails=2,values=['2','2','2','2'];
 const handlers={},nodes={};
 const node=id=>nodes[id]??=(function(){
   let classes=new Set(['gate','audit','result'].includes(id)?['hidden']:[]);
   return {value:'',innerHTML:'',textContent:'',disabled:false,options:[],classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){on??=!classes.has(c);on?classes.add(c):classes.delete(c);return on;}},
   addEventListener:(event,f)=>handlers[id+':'+event]=f, appendChild(){},setAttribute(){}};
 })();
 const html=fs.readFileSync(file,'utf8');
 const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
 const context=vm.createContext({
  console,URLSearchParams,URL,Response, setTimeout,clearTimeout,
  localStorage:{getItem:()=> 'fictional-paid-user',setItem(){},removeItem(){}},
  window:{location:{search:''},scrollTo(){},google:{accounts:{id:{initialize(){},renderButton(){}}}}},
  document:{getElementById:node,createElement:()=>node('new'+Math.random()),querySelector:(s)=>s.includes(':checked')?{value:values[0]}:null,head:{appendChild(){}}},
  fetch:async (url,o={})=>{
    const path=url.replace(/^.*?\/api\//,'/');
    calls.push([o.method??'GET',path]);
    if(path.endsWith('/entitlement'))return Response.json({entitled:paid,latestResult:latest});
    if(path.endsWith('/results')&&o.method==='POST'){
      payloads.push(JSON.parse(o.body));
      if(fails-- >0)return Response.json({error:'No new result was saved. Please retry.'},{status:503});
      latest={stage:'Fixture',score:55,liberationPlan:['Step from sample intake','2','3','4','5','6']};
      return Response.json({result:latest});
    }
    if(path.endsWith('/results'))return Response.json({results:latest?[latest]:[]});
    throw Error('Unexpected fetch '+path);
  }
 });
 vm.runInContext(code,context);
 await handlers['heroStart:click']();
 assert.equal(node('audit').classList.contains('hidden'),false);
 node('win').value='Fictional goal';
 node('drag').value='Fictional obstacle';
 node('asset').value='Fictional asset';
 for(let i=0;i<2;i++){await handlers['auditForm:submit']({preventDefault(){}});assert.match(node('auditError').innerHTML,/No new result was saved/);assert.equal(node('generateButton').disabled,false);}
 assert.deepEqual(payloads[0],payloads[1]);
 assert.equal(payloads[0].win,'Fictional goal');
 assert.equal(Object.values(payloads[0].ratings).flat().length,20);
 assert.equal(latest,null);
 await handlers['heroResults:click']();
 const purchaseShown=!node('gate').classList.contains('hidden')&&!node('checkoutButton').classList.contains('hidden');
 assert.equal(purchaseShown,!fixed);
 if(fixed){
  assert.match(node('auditError').innerHTML,/do not need to pay again/);
  await handlers['checkoutButton:click']();
  assert.equal(node('audit').classList.contains('hidden'),false);
 }
 await handlers['auditForm:submit']({preventDefault(){}});
 assert.equal(node('result').classList.contains('hidden'),false);
 await handlers['heroResults:click']();
 assert.match(node('plan').innerHTML,/Step from sample intake/);
 assert.equal(calls.some(([,p])=>p.endsWith('/checkout/session')),false);
 if(fixed){paid=false;latest=null;await handlers['heroStart:click']();assert.equal(node('gate').classList.contains('hidden'),false);assert.equal(node('checkoutButton').classList.contains('hidden'),false);}
 tests.push({file,paidNoResultShowsBuyButton:purchaseShown,simulatedTwoFailuresAndRecovery:true,savedPlanRetrieved:true,unpaidCheckoutVisible:fixed?'yes':'not checked'});
}
(async()=>{await test(process.argv[2] || require('node:path').resolve(__dirname,'../../freedom-audit/index.html'),true);console.log(JSON.stringify(tests));})().catch(e=>{console.error(e);process.exitCode=1;});
