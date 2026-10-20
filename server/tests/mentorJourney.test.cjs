const { test } = require('node:test');
const assert = require('node:assert/strict');

test('ordinary customer: guest consent, signup, personalized guidance, logout and return; ownership and failures', async () => {
  const router = require('../services/modelRouter');
  let prompt = '', unavailable = false, missingConfig = false;
  const fullReply = 'Maya, you can protect a quiet studio morning.\n\nTry sketching one small print before opening messages. You said you prefer gentle guidance and have two hours available. What would make that feel manageable?';
  router.requestModelText = async ({ prompt: value }) => { prompt = value; return unavailable ? { providerError: { message: 'fixture outage' } } : { text: 'We can explore your interest in printmaking at your pace.', model: 'fixture' }; };
  router.requestModelJson = async ({ prompt: value }) => { prompt = value; return missingConfig ? { error: { objectives: ['synthetic missing configuration'] } } : unavailable ? { providerError: { message: 'fixture outage' } } : { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ response: fullReply, objectives: ['Short objective'], constraints: [], risks: [], leverage: [], next_actions: ['Sketch one print'] }) }] } }] } }; };
  const f = await require('./reasoningFixture.cjs')();
  try {
    const guest = await f.request(null, '/api/ai/public/intelligence', 'POST', { guestMentor: true, prompt: 'I want to return to printmaking.' });
    assert.equal(guest.status, 200, JSON.stringify(guest)); assert(guest.data.guestTurn);
    assert.match(prompt, /No approved T.O.I./);
    const follow = await f.request(null, '/api/ai/public/intelligence', 'POST', { guestMentor: true, prompt: 'Where could I start?', guestTurns: [guest.data.guestTurn] });
    assert.equal(follow.status, 200); assert.match(prompt, /return to printmaking/);
    const credentials = { username: 'Maya', email: 'mentor-customer@example.test', password: 'Synthetic-journey-123!' };
    const signup = await f.request(null, '/api/auth/signup', 'POST', credentials);
    assert.equal(signup.status, 201, JSON.stringify(signup)); assert.equal(signup.data.role, 'USER');
    const first = { id: signup.data._id, token: signup.data.token };
    // Isolated rollout only; production permissions and flags are untouched.
    process.env.CORE_CONTEXT_WRITE_USER_IDS += ',' + first.id;
    const tokens = [guest.data.guestTurn, follow.data.guestTurn];
    const importBody = { consent: true, tokens };
    assert.equal((await f.request(null, '/api/memory/guest-conversation', 'POST', importBody)).status, 401);
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', { tokens })).status, 400);
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', { ...importBody, userId: f.other.id })).status, 400);
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', { consent: true, tokens: [tokens[0].slice(0, -8) + 'tampered'] })).status, 400);
    const expired = require('jsonwebtoken').sign({ id: 'expired', question: 'old', answer: 'old' }, process.env.JWT_SECRET, { audience: 'big-syz-guest-conversation', expiresIn: -1 });
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', { consent: true, tokens: [expired] })).status, 400);
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', importBody)).status, 200);
    assert.equal((await f.request(first, '/api/memory/guest-conversation', 'POST', importBody)).status, 200);
    assert.equal((await f.request(first, '/api/memory')).data.conversationHistory.length, 4);
    assert.equal((await f.request(f.other, '/api/memory')).data.conversationHistory.length, 0);
    const onboarding = await f.request(first, '/api/core/onboarding/complete', 'POST', { preferredName: 'Maya', mentorStyle: 'gentle', goals: ['Return to printmaking'], lifeStage: 'Building something meaningful' });
    assert.equal(onboarding.status, 200, JSON.stringify(onboarding));
    assert.equal((await f.request(first, '/api/core/context', 'PUT', { resources: [{ description: 'Two hours on Saturday' }] })).status, 200);
    const reply = await f.request(first, '/api/core/analyze', 'POST', { text: 'Help me make a little room for it.' });
    assert.equal(reply.status, 200, JSON.stringify(reply)); assert.equal(reply.data.text, fullReply);
    assert.match(prompt, /printmaking/); assert.match(prompt, /Maya/); assert.match(prompt, /gentle/); assert.match(prompt, /Two hours on Saturday/);
    const before = (await f.request(first, '/api/memory')).data.conversationHistory;
    assert.equal(before.at(-1).text, fullReply);
    assert.equal((await f.request(first, '/api/auth/logout', 'POST', {})).status, 200);
    assert.equal((await f.request(first, '/api/memory')).status, 401);
    const login = await f.request(null, '/api/auth/login', 'POST', credentials);
    assert.equal(login.status, 200); const second = { id: login.data._id, token: login.data.token };
    assert.notEqual(second.token, first.token);
    assert.deepEqual((await f.request(second, '/api/memory')).data.conversationHistory, before);
    await f.request(second, '/api/core/analyze', 'POST', { text: 'Can we continue from that suggestion?' });
    assert(prompt.includes(fullReply));
    unavailable = true;
    const count = (await f.request(second, '/api/memory')).data.conversationHistory.length;
    assert.equal((await f.request(second, '/api/core/analyze', 'POST', { text: 'Try again' })).status, 502);
    assert.equal((await f.request(second, '/api/memory')).data.conversationHistory.length, count);
    missingConfig = true;
    const missing = await f.request(second, '/api/core/analyze', 'POST', { text: 'Try again' });
    assert.equal(missing.status, 503); assert.match(missing.data.message, /temporarily unavailable/);
    assert.equal((await f.request(second, '/api/memory')).data.conversationHistory.length, count);
    assert.equal((await f.request(null, '/api/ai/public/intelligence', 'POST', { guestMentor: true, prompt: 'Hello' })).status, 502);
    assert.equal((await f.request(second, '/api/core/loop/start', 'POST', {})).status, 403);
    // M3 path also saves substantive replies and permits conversation without a goal.
    assert.equal((await f.request(second, '/api/core/context', 'PUT', { goals: [] })).status, 200);
    process.env.CORE_REASONING_USER_IDS += ',' + first.id;
    router.generateStructured = async () => ({ text: JSON.stringify({ response: 'We can take our time. What part would you like to explore?', recommendations: [], plan: null, questions: [], constraintConflicts: [] }) });
    const m3 = await f.request(second, '/api/core/analyze', 'POST', { text: 'I just want to talk, not make a plan.' });
    assert.equal(m3.status, 200, JSON.stringify(m3));
    assert.equal((await f.request(second, '/api/memory')).data.conversationHistory.at(-1).text, m3.data.response);
  } finally { await f.close(); }
});
