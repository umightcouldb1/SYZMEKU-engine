const VERSION = 'TOI_VOICE_V1';
const {VOICES,LEXICON,LINEAGE,applies,validateFeedback}=require('./lineage');
const REJECT = ['unlock your potential','step into your power','transform your life','elevate your journey','become your best self','game-changing','revolutionary solution','embark on a journey','discover the power of','reclaim your destiny','clarity meets purpose','chaos in, sequence out'];
REJECT.push('level up your life','live your best life','align with your highest self','unlock transformational clarity','empower yourself to take aligned action');
const BASE = Object.freeze({
  version: VERSION, rejectListVersion: 1,
  question: 'Would this plausibly sound like T.O.I., or does it sound like generic AI marketing copy?',
  sources: [
    {id:'founder-c0-2026-09-10',type:'explicit founder direction',authority:'voice constraints and example direction; not blanket approval of generated copy',examples:['Everybody Says Manage Your Time. Nobody Asks Who Owns It.','You Know What To Do. So Why The Fuck Aren’t You Doing It?'],rejections:REJECT},
    {id:'freedom-audit/index.html',type:'existing first-party product copy',authority:'product names, five domains, deliverables and one-time price; not proof of founder authorship'},
    {id:'Freedom Audit Launch / E0 saved campaign evidence',type:'previously approved publication',authority:'offer and overload/application themes; newer founder rejection overrides older slogans'},
  ],
  preferred:['Short direct sentences mixed with an explanation that earns its length.','Ask a concrete question, then work through it.','Challenge a claim or an assumption without shaming the person.','Use ordinary examples: the calendar, unfinished work, another saved video.','Humor comes from recognition, not a manufactured persona.','State a hypothesis as a hypothesis and check what happened.'],
  patterns:['What is actually making that decision?','Who owns that time?','Knowing it and doing it are two different things.','What happened when you tried it?'],
  patternProvenance:'First two adapt founder directions; last two are proposed application patterns, not attributed quotations.',
  prohibited:[...REJECT,'Invented street persona or exaggerated dialect','Profanity inserted just to signal authenticity','Fake personal stories, testimonials, guaranteed outcomes, diagnosis, invented urgency'],
  intensity:{calm:'Explain and question; no profanity required.',direct:'Name the contradiction; focus on the situation.',challenging:'A blunt question may include profanity when founder-approved for that piece; never attack the audience.'},
  adaptation:{short:'One recognizable situation; product/point early; a single action.',long:'Concrete opening, developed example, application exercise, limitations, then relevant offer.',sales:'Explain what it does, show what is received, state $37 one time; no pressure or miraculous outcome.',education:'Deliver a usable exercise without requiring a purchase.',platform:'Use a destination the viewer can actually follow. Do not substitute hashtags for meaning.'},
  limits:'Text heuristics enforce known constraints. They do not certify personal authenticity, vocal likeness or audio quality. Founder judgment remains required.',
});
const CONTRACT=Object.freeze({...BASE,...LINEAGE});
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[–—-]/g,' ').replace(/\s+/g,' ').trim();
function voiceCheck(text, learned=[], exceptions=[], context){
  const value=normalize(text), allowed=new Set(exceptions.map(normalize));
  const phrases=[...REJECT,...learned.filter(r=>r.category!=='authentic_preserve_pattern'&&applies(r,context)).map(x=>x.phrase)].filter(Boolean);
  const violations=[...new Set(phrases.filter(p=>value.includes(normalize(p))&&!allowed.has(normalize(p))))];
  if(context&&(!VOICES.includes(context.voice)||![0,1,2].includes(context.intensity)))violations.push('Explicit lineage voice and intensity required');
  if(context?.intensity===0&&/\b(shit|shyt|bullshit|bullshyt|damn|dayem|motherfucker|muthafuqa|fuck|fuq)\b/i.test(text))violations.push('Profanity is incompatible with CLEAN intensity');
  return {version:VERSION,voice:context?.voice||null,intensity:context?.intensity??null,question:CONTRACT.question,status:violations.length?'FAIL':'PASS',violations,approvedOrthography:LEXICON.entries.map(e=>e.founderSpelling),method:'Lineage/intensity and reject-list checks; approved founder spellings are not typos.',authenticity:'FOUNDER_REVIEW_REQUIRED'};
}
function applyLearning(text, learned=[],context){let value=String(text);for(const rule of learned){if(!rule.phrase||!rule.replacement||rule.category==='authentic_preserve_pattern'||!applies(rule,context))continue;const escaped=rule.phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');value=value.replace(new RegExp(escaped,'gi'),()=>rule.replacement);}return value;}
module.exports={CONTRACT,VERSION,REJECT,normalize,voiceCheck,applyLearning,validateFeedback,VOICES,LEXICON};
