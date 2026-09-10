// Perspectives change the question, never source authority, goal order, or permissions.
const PURPOSES = Object.freeze({
  mentor: 'mentor',
  recommend: 'recommend',
  planner: 'planner',
  sentinel: 'mentor'
});
function request(node, body) {
  const purpose = PURPOSES[node];
  if (!purpose) throw require('../services/reasoningCapabilityService').error('INVALID_REQUEST', 'Unknown planning perspective.');
  return {
    purpose,
    body: {
      ...body,
      text: node === 'sentinel' ? 'Identify uncertainty relevant to my selected goal. Missing wellness readings are unknown.\n' + body.text : body.text
    }
  };
}
module.exports = {
  request
};
