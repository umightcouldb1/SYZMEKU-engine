// Public dialogue only: never chain-of-thought or a canonical fact.
const LIMIT = 6000;
function bounded(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > LIMIT) {
    const error = new Error('Public conversation response exceeds the supported limit or is empty.');
    error.statusCode = 502; error.code = 'MODEL_OUTPUT_INVALID'; error.reasoningError = true;
    throw error;
  }
  return text.trim();
}
function legacy(parsed) {
  return bounded('Assistant interpretation and proposals (not verified facts):\n' +
    Object.entries(parsed).map(([key, values]) => key + ':\n' + values.map(v => '- ' + v).join('\n')).join('\n\n'));
}
function reasoning(result) {
  const parts = [];
  if (result.interpretation) parts.push('Assistant interpretation (not verified facts):\n' + result.interpretation.text,
    'References: ' + result.interpretation.evidenceRefs.join(', '),
    'Uncertainty: ' + result.interpretation.uncertainty.join('; '));
  parts.push('Operational summary: ' + result.summary);
  for (const r of result.recommendations) parts.push('Proposal: ' + r.description,
    'References: ' + r.evidenceRefs.join(', '),
    'Checkpoints: ' + r.successCriteria.join('; '),
    'Uncertainty: ' + r.uncertainty.join('; '));
  if (result.questions.length) parts.push('Questions: ' + result.questions.join('\n'));
  if (result.constraintConflicts.length) parts.push('Constraints requiring clarification: ' + result.constraintConflicts.map(c => c.description).join('; '));
  return bounded(parts.join('\n\n'));
}
function history(turns = []) {
  const selected = []; let size = 0;
  for (const turn of turns.slice(-12).reverse()) {
    const line = JSON.stringify({role: turn.role, text: turn.text});
    if (size + line.length > 24000) break;
    selected.unshift(line); size += line.length;
  }
  return 'Recent whole turns; older turns may be omitted. Assistant text is interpretation, not independent evidence. Later user corrections supersede earlier interpretations.\n' + selected.join('\n');
}
module.exports = {bounded, legacy, reasoning, history, LIMIT};
