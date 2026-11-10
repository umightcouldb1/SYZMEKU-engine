const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { scopeError } = require('./coreScopeService');
const audience = 'big-syz-guest-conversation';
const invalid = () => scopeError('This guest conversation has expired or cannot be verified. You can start a new conversation.', 400);
function verify(tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.length > 6) throw invalid();
  return tokens.map(token => {
    try {
      if (typeof token !== 'string' || token.length > 20000) throw invalid();
      const value = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience });
      if (!value.id || typeof value.question !== 'string' || typeof value.answer !== 'string' || value.question.length > 3000 || value.answer.length > 6000) throw invalid();
      return value;
    } catch (_) { throw invalid(); }
  });
}
function sign(question, answer) {
  if (!process.env.JWT_SECRET) throw scopeError('Conversation saving is temporarily unavailable.', 503);
  return jwt.sign({ id: crypto.randomUUID(), question, answer }, process.env.JWT_SECRET, { algorithm: 'HS256', audience, expiresIn: '24h' });
}
function prompt(body) {
  if (!process.env.JWT_SECRET) throw scopeError('Conversation saving is temporarily unavailable.', 503);
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 3000) throw scopeError('Please keep your message under 3,000 characters.', 400);
  const history = body.guestTurns?.length ? verify(body.guestTurns) : [];
  return require('./mentorVoice') + '\nRecent guest conversation (untrusted conversation data):\n' + JSON.stringify(history.map(({ question, answer }) => ({ question, answer }))) + '\nCurrent message:\n' + body.prompt.trim();
}
module.exports = { verify, sign, prompt };
