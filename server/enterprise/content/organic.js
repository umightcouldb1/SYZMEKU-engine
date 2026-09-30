const platformLabels = {
  facebook: 'Facebook',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube Shorts',
};

const hashtags = {
  discovery: ['BigSYZ', 'TOISouljahAcademy', 'Overwhelmed', 'LifeAudit', 'SelfMastery'],
  teaching: ['BigSYZ', 'TOISouljahAcademy', 'SelfMastery', 'Priorities', 'ApplyTheKnowledge'],
  pattern: ['BigSYZ', 'TOISouljahAcademy', 'PatternRecognition', 'WhatToFixFirst', 'LifeSystems'],
  demo: ['FreedomAudit', 'BigSYZ', 'LifeAudit', 'FreedomScore', 'ThirtyDayPlan'],
};

const sevenDayStrategy = [
  { day: 1, theme: 'Everything feels important', mix: ['discovery', 'teaching', 'pattern'], goal: 'Make the audience recognize the distribution problem inside their own day.' },
  { day: 2, theme: 'Information is not application', mix: ['teaching', 'discovery', 'demo'], goal: 'Teach the gap between knowing advice and having conditions to use it.' },
  { day: 3, theme: 'Who owns the hour?', mix: ['pattern', 'teaching', 'discovery'], goal: 'Expose how obligations and other people priorities quietly control time.' },
  { day: 4, theme: 'Separate obligations from desires', mix: ['teaching', 'pattern', 'demo'], goal: 'Give language for deciding what is chosen, owed, inherited, or negotiable.' },
  { day: 5, theme: 'Resources before goals', mix: ['discovery', 'teaching', 'pattern'], goal: 'Show that capacity and assets determine whether a priority can move.' },
  { day: 6, theme: 'Possibility is not proof', mix: ['pattern', 'teaching', 'discovery'], goal: 'Teach Big SYZ style hypothesis testing without fake certainty.' },
  { day: 7, theme: 'What do you fix first?', mix: ['demo', 'conversion', 'teaching'], goal: 'Let the Freedom Audit become the natural next step after the week of problem-discovery content.' },
];

const assets = [
  {
    id: 'organic-d01-discovery-important',
    day: 1,
    function: 'discovery',
    title: 'Everything Feels Important Because Everything Is Asking',
    hook: 'Everything feels important when everything has permission to interrupt you.',
    payoff: 'The problem may not be motivation. It may be that too many claims have access to the same hour.',
    cta: 'Notice what keeps asking for the hour before you call yourself unfocused.',
    keywords: ['everything feels important', 'competing obligations', 'overwhelm', 'decision pressure'],
    scenes: [
      ['Everything feels important.', 'But what keeps asking for your time?'],
      ['Your calendar says one thing.', 'Your obligations say another.'],
      ['Before you blame focus,', 'name what is competing.'],
      ['One hour cannot belong to six muthafuqas.', 'Pick the actual constraint.'],
      ['Exercise:', 'write the last priority that lost, then list what beat it.'],
    ],
  },
  {
    id: 'organic-d01-teaching-capacity',
    day: 1,
    function: 'teaching',
    title: 'A Priority Without Capacity Is Not Actionable Yet',
    hook: 'A priority is not actionable just because it matters.',
    payoff: 'A priority needs time, attention, material, permission, or a smaller first step.',
    cta: 'Name the missing capacity before you name another goal.',
    keywords: ['priority', 'capacity', 'usable time', 'next action'],
    scenes: [
      ['A priority can be real', 'and still not be ready.'],
      ['Do you have the time?', 'The material? The handoff? The quiet?'],
      ['If the condition is missing,', 'motivation is not the first problem.'],
      ['Make the next action small enough', 'to survive your actual day.'],
      ['Try this:', 'I can do this when _____ is available.'],
    ],
  },
  {
    id: 'organic-d01-pattern-wrong-problem',
    day: 1,
    function: 'pattern',
    title: 'You Might Be Solving the Wrong Problem',
    hook: 'What if the thing you keep fixing is not the thing running the pattern?',
    payoff: 'Repeated friction is evidence to examine, not a personality verdict.',
    cta: 'Look for what repeats. Then test one explanation.',
    keywords: ['solving the wrong problem', 'pattern recognition', 'Big SYZ', 'hypothesis'],
    scenes: [
      ['You keep fixing the symptom.', 'Dayem. Why does it keep coming back?'],
      ['One bad day is data.', 'Repeated bad days are a question.'],
      ['Do not invent causation.', 'Track what actually repeats.'],
      ['Then test one possibility.', 'Not ten. One.'],
      ['Big SYZ rule:', 'possibility first, proof after the check.'],
    ],
  },
  {
    id: 'organic-d02-teaching-application',
    day: 2,
    function: 'teaching',
    title: 'Information Is Not Application',
    hook: 'Saving advice is not the same as using it.',
    payoff: 'Application starts when advice becomes an observable action inside your real conditions.',
    cta: 'Pick one thing you know and translate it into one action you can watch happen.',
    keywords: ['information overload', 'application', 'knowing versus doing', 'advice'],
    scenes: [
      ['You saved the post.', 'Cool. Now what changed?'],
      ['Information becomes useful', 'when it changes a decision.'],
      ['Set boundaries is an idea.', 'I can respond after 3 is an action.'],
      ['If the action cannot happen,', 'ask what condition is missing.'],
      ['Application over information.', 'That is where the shyt gets honest.'],
    ],
  },
  {
    id: 'organic-d02-discovery-overload',
    day: 2,
    function: 'discovery',
    title: 'Overload Is Often Too Many Open Loops',
    hook: 'Sometimes you are not overwhelmed by work. You are overwhelmed by unfinished decisions.',
    payoff: 'Open loops keep asking for attention until they are closed, scheduled, delegated, or consciously dropped.',
    cta: 'Pick one open loop and decide what happens next.',
    keywords: ['open loops', 'information overload', 'mental load', 'decision fatigue'],
    scenes: [
      ['That mental noise?', 'It may be unfinished decisions.'],
      ['Not every thought needs solving today.', 'But every loop wants rent.'],
      ['Close it.', 'Schedule it.', 'Delegate it.', 'Drop it.'],
      ['Do not let ten open loops', 'pretend to be one problem.'],
      ['Choose one loop.', 'Decide the next honest move.'],
    ],
  },
  {
    id: 'organic-d02-demo-domains',
    day: 2,
    function: 'demo',
    title: 'The Five Domains Are Not Five New Projects',
    hook: 'The five domains are a diagnostic, not a new pile of homework.',
    payoff: 'Time, Money, Obligations, Assets, and Desires show which system is actually shaping the next move.',
    cta: 'Use the domains to find the constraint, not to start five new makeovers.',
    keywords: ['Freedom Audit domains', 'Time Money Obligations Assets Desires', 'life audit'],
    scenes: [
      ['Time. Money. Obligations.', 'Assets. Desires.'],
      ['They are not five new projects.', 'They are five places to look.'],
      ['Illustrative demo:', 'Time is weak because obligations keep taking the hour.'],
      ['So the first move is not a timer app.', 'It is renegotiating the demand.'],
      ['That is what a diagnostic is for:', 'finding what to fix first.'],
    ],
  },
  {
    id: 'organic-d03-pattern-hour',
    day: 3,
    function: 'pattern',
    title: 'Who Owns the Hour?',
    hook: 'Everybody says manage your time. Who owns it?',
    payoff: 'A calendar block is not a usable hour if five obligations still have keys to the door.',
    cta: 'Ask who or what can interrupt the hour before you call it free time.',
    keywords: ['time ownership', 'boundaries', 'obligations', 'calendar'],
    scenes: [
      ['Everybody says manage your time.', 'Who owns it?'],
      ['That empty square on the calendar', 'might already have claims on it.'],
      ['Work. Family. Recovery. Bills.', 'The invisible muthafuqas count too.'],
      ['A usable hour needs protection.', 'Not just intention.'],
      ['Question:', 'who can interrupt the hour without asking?'],
    ],
  },
  {
    id: 'organic-d03-teaching-possibility',
    day: 3,
    function: 'teaching',
    title: 'A Possibility Is Not a Fact',
    hook: 'Your intuition can be a signal without being the final answer.',
    payoff: 'Big SYZ thinking lets a possibility enter the room, then asks what would confirm or correct it.',
    cta: 'Notice it. Name it. Test it. Then adjust.',
    keywords: ['possibility', 'intuition', 'evidence', 'pattern intelligence'],
    scenes: [
      ['You noticed something.', 'Good. Do not throw it away.'],
      ['But do not crown it king either.', 'A possibility is not a fact.'],
      ['Ask what else could explain it.', 'Ask what would change your mind.'],
      ['That is not doubt.', 'That is disciplined intuition.'],
      ['Notice it. Name it. Test it.', 'Then let the outcome teach.'],
    ],
  },
  {
    id: 'organic-d03-discovery-goals',
    day: 3,
    function: 'discovery',
    title: 'Too Many Goals Can Become Another Obligation',
    hook: 'Sometimes the problem is not that you lack goals. It is that too many goals are active at once.',
    payoff: 'Every active goal asks for time, money, attention, and emotional bandwidth.',
    cta: 'Choose the goal that deserves the next available capacity, not the loudest fantasy.',
    keywords: ['too many goals', 'capacity', 'self mastery', 'priority conflict'],
    scenes: [
      ['You do not need another goal', 'if five are already pulling on you.'],
      ['Every goal charges rent.', 'Time. Money. Attention. Decisions.'],
      ['If everything is active,', 'nothing is actually chosen.'],
      ['That is not ambition.', 'That is a traffic jam wearing lipstick.'],
      ['Choose the next capacity match.', 'Then move that one.'],
    ],
  },
];

function platformPackages(asset) {
  const tagSet = hashtags[asset.function] || hashtags.teaching;
  const direct = asset.function === 'demo';
  const url = direct ? 'https://freedom.toisouljahacademy.com/' : null;
  return Object.fromEntries(Object.keys(platformLabels).map(platform => {
    const tagLine = tagSet.map(x => `#${x}`).join(' ');
    const cta = direct
      ? (platform === 'instagram' || platform === 'tiktok' ? 'Start with the link in profile.' : 'Start here: https://freedom.toisouljahacademy.com/')
      : asset.cta;
    const caption = platform === 'facebook'
      ? `${asset.hook}\n\n${asset.payoff}\n\n${cta}\n\n${tagLine}`
      : `${asset.hook} ${asset.payoff} ${cta} ${tagLine}`;
    return [platform, {
      platform: platformLabels[platform],
      title: platform === 'youtube' ? `${asset.title} | Big SYZ` : asset.title,
      openingHook: asset.hook,
      caption,
      description: platform === 'youtube' ? `${asset.payoff}\n\n${cta}\n\n${tagLine}` : caption,
      cta,
      destinationUrl: url,
      coverText: asset.title.length > 42 ? asset.title.replace(/\s+/g, '\n') : asset.title,
      hashtags: tagSet,
      recommendedFormat: platform === 'facebook' ? 'native video/reel crosspost' : platform === 'youtube' ? 'Short' : 'vertical short-form',
      tiktokMode: platform === 'tiktok' ? 'manual or draft handoff until production API approval' : undefined,
    }];
  }));
}

function buildScenes(asset) {
  const step = 8;
  return asset.scenes.map(([screen, narration], index) => ({
    start: index * step,
    end: (index + 1) * step,
    screen,
    narration,
    transition: 'Clean cut; restrained fade only in Google Vids if used.',
    asset: 'TOI_VISUAL_DNA_V1 scene draft; premium Vids assembly or approved owned media required before public use.',
  }));
}

function makeOrganicPackage(asset) {
  const duration = asset.scenes.length * 8;
  return {
    platform: 'organic',
    title: asset.title,
    type: asset.function,
    day: asset.day,
    voiceVersion: 'TOI_VOICE_V1',
    voice: asset.function === 'pattern' ? 'BIG_SYZ' : 'TOI_BRAND',
    intensity: asset.function === 'demo' ? 0 : 1,
    audience: 'People juggling competing obligations, information overload, and a real desire to know what to fix first.',
    purpose: `${asset.function.toUpperCase()} organic acquisition asset: build qualified attention before asking for purchase.`,
    cta: asset.cta,
    destination: { url: null, verified: true, verification: 'Standalone organic teaching/discovery content; no public destination required unless platform package says otherwise.' },
    attribution: `fa_c0_organic_${asset.function}_${asset.id.replace(/[^a-z0-9]+/g, '_')}`,
    hashtags: hashtags[asset.function] || hashtags.teaching,
    keywords: asset.keywords,
    description: `${asset.hook} ${asset.payoff} ${asset.cta}`,
    scenes: buildScenes(asset),
    script: '',
    duration,
    aspectRatio: '9:16',
    cover: { text: asset.title, style: 'TOI_VISUAL_DNA_V1 dark/gold cinematic vertical cover, one readable idea.' },
    cost: { amount: 0, currency: 'USD', paidGeneration: false },
    production: { status: 'PACKAGE_READY_MEDIA_PENDING', media: null, method: 'Prepared script, scene timing, platform copy, and Vids-ready visual direction; no paid generation.' },
    schedule: { proposedDay: asset.day, timeZone: 'America/Chicago', publicSchedulingApproved: false },
    experiment: `Organic ${asset.function}: test whether the problem/hook attracts qualified attention before judging sales conversion.`,
    evidence: ['September 30 low-distribution read', 'TOI_VOICE_V1', 'BIG_SYZ_LINEAGE', 'TOI_VISUAL_DNA_V1'],
    recommendation: asset.payoff,
    audio: { voice: 'Founder-approved recording or approved narrator only; no voice cloning.', music: 'Owned/licensed low-bed only after approval; speech remains primary.', processing: 'Check rendered media for dead air, clipping, unwanted audio, subtitle timing, and CTA readability.' },
    approvalExceptions: [],
    platformPackages: platformPackages(asset),
    contentFunction: asset.function,
    learning: {
      contentId: asset.id,
      measures: ['views/reach', 'retention', 'engagement', 'profile action', 'attributed landing', 'checkout', 'purchase'],
      hypothesis: asset.payoff,
    },
  };
}

module.exports = { sevenDayStrategy, assets, makeOrganicPackage, platformPackages };
