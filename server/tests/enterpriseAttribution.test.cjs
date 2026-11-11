const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseEvent } = require('../enterprise/policy');
const { catalog } = require('../enterprise/content/catalog');

const telemetry = fs.readFileSync(path.join(__dirname, '../../freedom-audit/business-telemetry.js'), 'utf8');
const event = content => ({
  id: crypto.randomUUID(), visitId: crypto.randomUUID(), event: 'landing_view',
  source: 'youtube', medium: 'social', campaign: 'freedom_audit_launch', content,
});

function browser(params = {}, store = new Map(), overrides = {}) {
  const sent = [];
  const context = {
    window: {},
    location: { hostname: 'freedom.toisouljahacademy.com', search: '?' + new URLSearchParams(params) },
    navigator: {}, URLSearchParams, crypto,
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    fetch: (url, options) => {
      sent.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve();
    },
    ...overrides,
  };
  vm.runInNewContext(telemetry, context);
  return { context, sent, store };
}

const trackedParams = content => ({
  utm_source: 'youtube', utm_medium: 'social', utm_campaign: 'freedom_audit_launch', utm_content: content,
});

test('every current Content Factory identifier survives browser and server attribution', () => {
  const packages = catalog();
  assert.ok(packages.length > 0);
  for (const { id, package: contentPackage } of packages) {
    const content = contentPackage.attribution;
    assert.match(content, /^fa_c0_/);
    const { sent } = browser(trackedParams(content));
    assert.equal(sent.length, 1, id);
    assert.equal(sent[0].body.content, content, id);
    const parsed = parseEvent(sent[0].body);
    assert.equal(parsed.content, content, id);
    assert.equal(parsed.campaign, 'freedom_audit_launch', id);
    assert.equal(parsed.authority, 'unverified_browser_event', id);
  }
});

test('legacy and Content Factory content namespaces retain bounded, case-insensitive tokens', () => {
  for (const prefix of ['fa_launch_', 'fa_c0_']) {
    for (const suffix of ['a', 'youtube_variant_b_v1', 'a'.repeat(90), 'A0_Z']) {
      const content = prefix + suffix;
      assert.equal(parseEvent(event(content)).content, content);
      assert.equal(browser(trackedParams(content)).sent[0].body.content, content);
      const upper = content.toUpperCase();
      assert.equal(parseEvent(event(upper)).content, upper);
      assert.equal(browser(trackedParams(upper)).sent[0].body.content, upper);
    }
  }
});

test('a new Content Factory visit replaces legacy attribution and persists across untagged navigation', () => {
  const legacy = browser(trackedParams('fa_launch_youtube_variant_b'));
  const content = 'fa_c0_youtube_sales_v1_d01';
  const next = browser(trackedParams(content), legacy.store);
  const continued = browser({}, legacy.store);
  for (const result of [next, continued]) {
    const sent = result.sent[0].body;
    assert.equal(sent.content, content);
    assert.equal(sent.visitId, legacy.sent[0].body.visitId);
    assert.equal(parseEvent(sent).content, content);
  }
  continued.context.window.freedomBusinessEvent('checkout_start');
  assert.equal(continued.sent[1].body.content, content);
  assert.notEqual(continued.sent[1].body.id, continued.sent[0].body.id);
});

test('malformed or arbitrary content remains excluded by both parsers', () => {
  const invalid = [
    '', 'fa_c0_', 'fa_launch_', 'fa_other_video', 'other_fa_c0_video',
    'fa_c0_' + 'a'.repeat(91), 'fa_launch_' + 'a'.repeat(91),
    'fa_c0_video-name', 'fa_c0_private@example.com', 'fa_c0_video/SECRET',
    'fa_c0_video?private=SECRET', 'fa_c0_video SECRET', 'https://example.test/private',
  ];
  for (const content of invalid) {
    assert.equal(parseEvent(event(content)).content, 'unattributed', content);
    const { sent, store } = browser(trackedParams(content));
    assert.equal(sent[0].body.content, '', content);
    assert.equal(store.has('freedomBusinessContent'), false, content);
    assert.equal(parseEvent(sent[0].body).content, 'unattributed', content);
  }
});

test('content compatibility does not broaden campaign or event payload allowlists', () => {
  for (const campaign of ['freedom_audit_launch', 'fa_launch_youtube']) {
    const { sent } = browser({ ...trackedParams('fa_c0_youtube_sales_v1_d01'), utm_campaign: campaign, private: 'SECRET' });
    assert.equal(parseEvent(sent[0].body).campaign, campaign);
    assert.ok(!JSON.stringify(sent).includes('SECRET'));
    assert.equal(sent[0].options.credentials, 'omit');
  }
  const body = event('fa_c0_youtube_sales_v1_d01');
  assert.equal(parseEvent({ ...body, campaign: 'fa_c0_not_a_campaign' }).campaign, 'unattributed');
  assert.equal(browser({ ...trackedParams(body.content), utm_campaign: 'fa_c0_not_a_campaign' }).sent[0].body.campaign, '');
  assert.equal(parseEvent({ ...body, answers: 'PRIVATE' }), null);
  assert.equal(parseEvent({ ...body, event: 'purchase' }), null);
});

test('Content Factory attribution still honors privacy controls and never gates buyer actions', () => {
  const params = trackedParams('fa_c0_youtube_sales_v1_d01');
  for (const overrides of [
    { navigator: { doNotTrack: '1' } },
    { navigator: { globalPrivacyControl: true } },
    { location: { hostname: 'localhost', search: '?' + new URLSearchParams(params) } },
    { sessionStorage: { getItem: () => { throw Error('Storage blocked'); } } },
  ]) {
    const { context, sent } = browser(params, new Map(), overrides);
    assert.doesNotThrow(() => context.window.freedomBusinessEvent('checkout_start'));
    assert.equal(sent.length, 0);
  }
  const { context } = browser(params, new Map(), { fetch: () => { throw Error('Network blocked'); } });
  assert.doesNotThrow(() => context.window.freedomBusinessEvent('checkout_start'));
});
