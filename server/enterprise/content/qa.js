const {voiceCheck}=require('./voice');
const crypto=require('node:crypto');
const {validateVisual,fitsFrame,VISUAL_REVIEW}=require('./visual');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const words=s=>String(s||'').trim().split(/\s+/).filter(Boolean).length;
function qa(p,learned=[]){const checks=[],add=(id,pass,detail)=>checks.push({id,status:pass?'PASS':'FAIL',detail});const text=[p.title,p.description,p.script,...(p.scenes||[]).map(s=>s.screen)].join('\n');
 const voice=voiceCheck(text,learned,p.approvalExceptions||[],p);add('voice',voice.status==='PASS',voice.violations.join('; ')||'Known rejected phrases absent; founder authenticity judgment still required.');
 add('visual_contract',validateVisual(p),'Exact TOI_VISUAL_DNA_V1 tokens, intentional symbols and generated scene geometry.');
 add('visual_text_bounds',fitsFrame(p),'Draft copy fits declared safe layout; actual mobile readability remains pending.');
 add('discovery_orthography',p.keywords?.some(k=>!(/\b(fuq|shyt|bullshyt|dayem|muthafuqa)\b/i.test(k))),'Plain-language discovery phrases remain separate from signature visible spelling.');
 add('audience',!!p.audience&&!!p.purpose,'Explicit intended problem and purpose.');
 add('discovery',!!p.title&&p.keywords?.length>0&&p.description?.length>30,'Title, intent phrases and description required; search volume is not invented.');
 add('script',p.script?.length>80&&p.type!=='longform-outline','Complete script required.');
 add('claims',!/(guaranteed (results|success)|cures? (burnout|anxiety|depression)|thousands of happy|only \d+ (spots|left)|customer (said|says))/i.test(text),'Rule-based claim screen; not proof that every statement is accurate.');
 const scenes=p.scenes||[];add('timeline',scenes.length>0&&scenes[0].start===0&&scenes.every((s,i)=>s.end>s.start&&(!i||Math.abs(s.start-scenes[i-1].end)<.01))&&scenes.at(-1).end===p.duration,'Continuous explicit scene timings.');
 add('speech_pacing',scenes.every(s=>!s.narration||words(s.narration)/(s.end-s.start)*60<=205),'Estimated maximum 205 words/minute; rendered speech still requires checking.');
 add('subtitles',!!p.subtitles&&p.subtitles.includes('-->'),'Timed draft subtitles present; not yet aligned to a rendered voice track.');
 add('aspect_ratio',['9:16','16:9'].includes(p.aspectRatio),'Declared production ratio.');
 add('attribution',/^fa_c0_[a-z0-9_]+$/.test(p.attribution),'Stable proposed identifier; profile routes and current analytics do not prove post attribution.');
 add('destination',p.destination?.verified===true,'Exact destination must be verified for this version; never assume a stored profile URL is live.');
 add('cost',p.cost?.amount===0&&!p.cost?.paidGeneration,'C0 cannot spend or invoke paid generation.');
 if(p.type==='sales'){
  const first=pattern=>scenes.find(s=>pattern.test(s.screen+' '+s.narration))?.start;
  add('product_reveal',first(/The Freedom Audit/i)<=5,'Product by 5 seconds.');add('demo_score',first(/ILLUSTRATIVE DEMO[\s\S]*Freedom Score/)<=11,'Visible illustrative score early.');add('demo_plan',first(/ILLUSTRATIVE DEMO[\s\S]*30-Day Liberation Plan/)<=14,'Visible illustrative plan early.');add('price',first(/\$37/)<=16&&!/\$(?!37\b)\d/.test(text),'$37 one-time price.');add('cta_timing',scenes.some(s=>s.start<=18&&s.screen===p.cta)&&scenes.at(-1)?.screen===p.cta,'Early and final CTA.');
 }
 if(p.type==='longform'){add('longform_duration',p.duration>=480&&p.duration<=1200,'8–20 minute estimated runtime.');add('longform_structure',p.chapters?.[0]?.start===0&&p.chapters.length>=4&&p.extractions?.length>=3&&!!p.pinnedComment&&p.titleCandidates?.length===5,'Chapters, title candidates, pinned comment and extraction markers.');add('value_before_offer',p.script.indexOf('thirty-seven')>p.script.length*.65,'Offer follows the standalone exercise.');}
 // Media approval is deliberately separate from text/package checks.
 for(const id of ['rendered_media','mobile_readability','audio_continuity','dead_air','unwanted_speech','blank_frames','transitions','subtitle_alignment','message_accuracy',...VISUAL_REVIEW])checks.push({id,status:p.production?.review?.checks?.[id]===true?'MANUAL_PASS':'PENDING',detail:'Requires the finished immutable media; text does not prove this check.'});
 if(p.platform==='tiktok')checks.push({id:'tiktok_review',status:'PENDING',detail:'Production review/OAuth approval pending.'});
 const failures=checks.filter(c=>c.status==='FAIL'),pending=checks.filter(c=>c.status==='PENDING');
 return {voice,checks,status:failures.length?'FAIL':pending.length?'PARTIAL':'PASS',canApprove:!failures.length&&!pending.length&&!!p.production?.media?.sha256,packageHash:hash(p)};
}
module.exports={qa,hash,canonical};
