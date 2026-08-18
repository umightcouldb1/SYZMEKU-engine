const FREEDOM_AUDIT_URL = 'https://freedom.toisouljahacademy.com';

const normalizePlatform = (value = '') => {
  const lower = String(value || '').toLowerCase();
  if (['facebook', 'instagram'].includes(lower)) return 'meta';
  if (lower === 'youtube') return 'youtube';
  if (lower === 'tiktok') return 'tiktok';
  return lower;
};

const withUtm = (url, source, campaign = 'freedom_audit_launch') => {
  const parsed = new URL(url);
  parsed.searchParams.set('utm_source', source);
  parsed.searchParams.set('utm_medium', 'social');
  parsed.searchParams.set('utm_campaign', campaign);
  return parsed.toString();
};

const freedomAuditTemplate = () => ({
  name: 'Freedom Audit Launch',
  objective: 'Launch a concise multi-platform campaign for The Freedom Audit.',
  sourceProduct: 'The Freedom Audit(TM)',
  sourceUrl: FREEDOM_AUDIT_URL,
  status: 'generated',
  metadata: {
    templateKey: 'freedom_audit_launch',
    price: '$37',
    coreCta: 'Run your Freedom Audit',
    coreHook: "You don't have a time-management problem. You have a priority problem.",
    coreLine: 'Chaos in. Sequence out.',
  },
  posts: [
    {
      provider: 'meta',
      format: 'text',
      title: 'Facebook launch post',
      caption: [
        "You don't have a time-management problem. You have a priority problem.",
        '',
        'When Time, Money, Obligations, Assets, and Desires are all competing for attention, more hustle only adds more noise.',
        '',
        'The Freedom Audit(TM) turns the noise into a clear sequence: score the five domains, identify the primary bottleneck, and leave with a focused 30-Day Liberation Plan.',
        '',
        'Chaos in. Sequence out.',
        '',
        'Run your Freedom Audit for $37:',
      ].join('\n'),
      link: withUtm(FREEDOM_AUDIT_URL, 'facebook'),
      hashtags: ['FreedomAudit', 'BigSYZ', 'TOISouljahAcademy'],
      publishStatus: 'draft',
    },
    {
      provider: 'meta',
      format: 'reel',
      title: 'Instagram Reel + caption',
      caption: [
        'Hook: You do not need another planner. You need a bottleneck audit.',
        '',
        'Time. Money. Obligations. Assets. Desires.',
        'Find the domain draining your freedom and turn it into a 30-day sequence.',
        '',
        'Chaos in. Sequence out.',
        'Run your Freedom Audit: $37',
      ].join('\n'),
      link: withUtm(FREEDOM_AUDIT_URL, 'instagram'),
      hashtags: ['FreedomAudit', 'PriorityProblem', 'LiberationPlan', 'BigSYZ', 'TOISouljahAcademy'],
      publishStatus: 'draft',
    },
    {
      provider: 'youtube',
      format: 'short',
      title: "You don't have a time-management problem",
      description: [
        'Most overwhelm is not a calendar issue. It is a sequence issue.',
        '',
        'The Freedom Audit(TM) scores Time, Money, Obligations, Assets, and Desires so you can identify the bottleneck and generate a focused 30-Day Liberation Plan.',
        '',
        `Run the audit: ${withUtm(FREEDOM_AUDIT_URL, 'youtube')}`,
      ].join('\n'),
      hashtags: ['FreedomAudit', 'BigSYZ', 'TimeManagement', 'Productivity', 'TOISouljahAcademy'],
      publishStatus: 'draft',
    },
    {
      provider: 'tiktok',
      format: 'video',
      title: 'Priority problem, not time problem',
      caption: 'You do not have a time-management problem. You have a priority problem. Audit the five domains. Find the bottleneck. Chaos in. Sequence out.',
      link: withUtm(FREEDOM_AUDIT_URL, 'tiktok'),
      hashtags: ['FreedomAudit', 'PriorityProblem', 'BigSYZ', 'LiberationPlan'],
      publishStatus: 'draft',
    },
  ],
});

const generateCampaignDraft = (input = {}) => {
  const isFreedomAudit = !input.productName || /freedom audit/i.test(input.productName);
  const base = isFreedomAudit ? freedomAuditTemplate() : {
    name: input.name || `${input.productName || 'Social'} Campaign`,
    objective: input.objective || '',
    sourceProduct: input.productName || '',
    sourceUrl: input.productUrl || '',
    status: 'generated',
    metadata: {
      price: input.price || '',
      offer: input.offer || '',
      cta: input.cta || '',
      tone: input.tone || 'clear, strategic, action-oriented',
    },
    posts: [],
  };

  if (!isFreedomAudit) {
    const platforms = (input.platforms || ['facebook', 'instagram', 'youtube', 'tiktok']).map(normalizePlatform);
    const productUrl = input.productUrl || '';
    const cta = input.cta || 'Learn more';
    const hook = input.hook || `A focused offer for ${input.targetAudience || 'the right audience'}.`;
    const promise = input.promise || input.offer || input.objective || '';
    if (platforms.includes('meta')) {
      base.posts.push({
        provider: 'meta',
        format: 'text',
        title: `${input.productName || 'Offer'} Facebook post`,
        caption: `${hook}\n\n${promise}\n\n${cta}:`,
        link: productUrl ? withUtm(productUrl, 'facebook') : '',
        hashtags: ['SYZMEKU', 'TOISouljahAcademy'],
      });
    }
    if (platforms.includes('youtube')) {
      base.posts.push({
        provider: 'youtube',
        format: 'short',
        title: hook.slice(0, 95),
        description: `${promise}\n\n${cta}: ${productUrl ? withUtm(productUrl, 'youtube') : ''}`,
        hashtags: ['SYZMEKU', 'TOISouljahAcademy'],
      });
    }
    if (platforms.includes('tiktok')) {
      base.posts.push({
        provider: 'tiktok',
        format: 'video',
        title: hook.slice(0, 95),
        caption: `${hook} ${cta}`.slice(0, 2200),
        link: productUrl ? withUtm(productUrl, 'tiktok') : '',
        hashtags: ['SYZMEKU', 'Launch'],
      });
    }
  }

  const allowedProviders = new Set((input.platforms || []).map(normalizePlatform).filter(Boolean));
  if (allowedProviders.size) {
    base.posts = base.posts.filter((post) => allowedProviders.has(post.provider));
  }

  return base;
};

module.exports = { generateCampaignDraft, freedomAuditTemplate, withUtm };
