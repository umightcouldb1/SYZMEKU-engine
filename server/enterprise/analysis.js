const { ROLES } = require('./policy');
const missing = (stage, reason) => ({ stage, count: null, conversion: null, coverage: 'NOT INSTRUMENTED', source: reason });
function analyze(input) {
  const { social, commerce, product, telemetry, auth, health, window } = input;
  const rows = [];
  rows.push({ stage: 'Social publication', count: social.posts.filter(p => p.inWindow && p.status === 'published').length, conversion: null, coverage: social.coverage, source: 'Owned SocialCampaign publication receipts; not independent platform delivery confirmation' });
  for (const [stage,keys] of [['Impressions / reach',['impressions','reach']],['Engagement',['likes','comments','shares']],['Link clicks',['clicks']]]) {
    const details=(social.measurements||[]).flatMap(m=>keys.filter(k=>m.metrics[k]!==undefined).map(k=>({postId:m.postId,provider:m.provider,metric:k,value:m.metrics[k],observedAt:m.observedAt})));
    rows.push({...missing(stage,'Stored default zeros are not measurements; counts cannot establish cross-platform unique people'),coverage:details.length?'LIMITED — see per-post measured metrics':'NOT INSTRUMENTED',measurements:details});
  }
  const browser = (stage, event) => {
    const metric = telemetry.counts?.find(x => x._id === event);
    return { stage, count: metric?.count ?? null, conversion: null, coverage: telemetry.since ? 'PARTIAL — browser events, not unique people; only since instrumentation began' : 'NOT INSTRUMENTED', source: `First-party ${event}; unverified and potentially blocked`, observedSince: telemetry.since || null };
  };
  rows.push(browser('Landing visits', 'landing_view'), browser('Sign-in attempts', 'sign_in_start'), browser('Successful sign-ins', 'sign_in_success'), browser('CTA clicks', 'cta_click'));
  rows.push({stage:'Checkout-session creation',count:commerce.ok?commerce.customerSessions:null,founderValidationCount:commerce.founderSessions,conversion:null,coverage:commerce.ok?'Stripe product-matched sessions; founder excluded':'UNAVAILABLE',source:'Stripe checkout.sessions, creation cohort'});
  rows.push(missing('Stripe Checkout opens', 'Checkout creation and redirect are not proof that Stripe Checkout loaded'));
  rows.push({stage:'Payment attempts',count:commerce.attempts ?? null,conversion:null,coverage:commerce.ok?'PARTIAL — attempts only on linked PaymentIntents; pre-intent errors unavailable':'UNAVAILABLE',source:'Stripe linked PaymentIntent latest_charge'});
  rows.push({stage:'Successful payments',count:commerce.ok?commerce.sales:null,conversion:null,coverage:commerce.ok?'Stripe product-matched paid sessions; founder excluded':'UNAVAILABLE',source:'Stripe checkout.sessions payment_status=paid'});
  rows.push({stage:'Entitlement',count:product.entitlements,conversion:null,coverage:'Product-scoped paid grants in window; not a joined checkout cohort',source:'UserProfile.purchasedProducts aggregate, founder excluded'});
  rows.push({stage:'Product completion',count:product.completions,conversion:null,coverage:'Retained completion records only (last 10 per account); founder excluded',source:'UserProfile.freedomAudit.results.completedAt aggregate; answers never selected'});
  const findings = [];
  const add = (id, severity, title, evidence, recommendation) => findings.push({id,severity,title,evidence,recommendation});
  add('measurement-gap','ACTION RECOMMENDED','Buyer acquisition is not yet measurable end to end',['No verified impressions / click counts', 'Browser instrumentation cannot reconstruct historical visits'], 'Collect an instrumented observation window before judging creative or price.');
  if (commerce.ok && !commerce.sales) add('no-sales','WATCH','No recorded customer sales in this window',[`${commerce.customerSessions} non-founder checkout sessions`, `${commerce.founderSessions} founder validation sessions excluded`], 'Distinguish lack of buyers reaching checkout from checkout abandonment. No causal claim is established.');
  const blocked = social.posts.filter(p => p.status !== 'published' && p.errorCode);
  if(blocked.length) add('distribution-blocked','APPROVAL REQUIRED','Some prepared distribution has not published',blocked.map(p=>`${p.platform}: ${p.errorCode}`),'Review whether to connect and approve the unavailable channel; do not publish automatically.');
  const noPostTags=social.posts.filter(p=>!p.postAttribution);
  if(noPostTags.length) add('post-attribution','ACTION RECOMMENDED','Post-level attribution is incomplete',[`${noPostTags.length} stored links lack utm_content`, 'Existing Stripe sessions do not retain campaign attribution'], 'Prepare distinct post links and a reviewed checkout attribution change; current release leaves campaign links and checkout behavior unchanged.');
  for(const [name,result] of Object.entries(health)) if(result.status !== 200) add('health-'+name,'INCIDENT',`${name} availability check failed`,[String(result.status)],'Inspect the failing service. No automatic rollback or public changes.');
  if(!commerce.ok) add('stripe-read','INCIDENT','Stripe analytics unavailable',['Bounded read failed; prior figures are not represented as current'],'Inspect commerce read access without changing Stripe configuration.');
  const authFailures=auth.filter(x=>x._id?.success===false).reduce((s,x)=>s+x.count,0);
  for(const metric of telemetry.counts||[])if(/^server_.*_failure$/.test(metric._id)&&metric.count>0)add(metric._id,'INCIDENT','Business endpoint failures observed',[`${metric._id}: ${metric.count} responses since instrumentation began`],'Inspect server operations; no automatic customer or payment changes.');
  if(authFailures) add('auth-failures','WATCH','Authentication failures recorded',[`${authFailures} aggregate auth failures across Academy; product attribution unavailable`],'Inspect scoped operational errors before attributing to Freedom Audit.');
  const domains={
    'Chief of Staff':findings.map(x=>x.id),'Growth + Conversion':['measurement-gap','no-sales','post-attribution'],
    'Marketing Strategy':['measurement-gap','post-attribution'],'Content Intelligence':['measurement-gap'],
    'Social Command Analyst':['distribution-blocked','post-attribution'],'Funnel / Sales':['no-sales','auth-failures','measurement-gap'],
    'Commerce / Revenue':['stripe-read','no-sales'],'Product Intelligence':['no-sales'],
    'Technology / SRE':findings.filter(x=>x.severity==='INCIDENT'||x.id==='auth-failures').map(x=>x.id),'Customer Journey':['measurement-gap','auth-failures']};
  const roles=ROLES.map(name=>({name,status:'ACTIVE — deterministic analysis',findingIds:domains[name].filter(id=>findings.some(f=>f.id===id)),authority:'business observation and recommendations only',limitation:['Content Intelligence','Marketing Strategy','Product Intelligence','Customer Journey'].includes(name)?'Qualitative conclusions require reviewed creative and journey evidence; no autonomous inference of causation':null}));
  return { version:'EnterpriseBriefV1',generatedAt:new Date().toISOString(),window,execution:'DISABLED',personalExecution:input.personalExecution,m3:input.m3,
    revenue:{amount:commerce.revenue ?? null,currency:'usd',sales:commerce.ok?commerce.sales:null,founderExcluded:true},funnel:rows,
    social,commerce,product,auth,health,telemetry,roles,findings,approvalQueue:findings.filter(x=>x.severity==='APPROVAL REQUIRED').slice(0,5),
    diagnosis:'Insufficient acquisition evidence to establish why sales are zero. Missing telemetry is not zero traffic. Founder checkout checks are not customer demand. Creative, price, trust and targeting remain untested hypotheses.',
    attribution:{platform:'UTM links exist; browser source is unverified',post:'NOT INSTRUMENTED',payment:'NOT INSTRUMENTED'},
    limitations:['No cross-stage conversion is calculated without a joined, comparable cohort.', 'No customer personal context or product answers are read.', 'No provider reasoning, publishing, spending or messaging is invoked.'] };
}
module.exports={analyze};
