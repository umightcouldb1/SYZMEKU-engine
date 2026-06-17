const fs = require('fs');
const path = require('path');

const tuningPath = path.resolve(__dirname, '..', 'identity', 'trauma_awareness_tuning.json');
const raw = fs.readFileSync(tuningPath, 'utf8');
const tuning = JSON.parse(raw);

const topPriority = tuning.priorityOrder?.[0];

if (tuning.status !== 'TRAUMA_AWARE_TOP_STACK') {
  console.error('TRAUMA_AWARE status not locked at top stack');
  process.exit(1);
}

if (topPriority !== 'Trauma-Aware Safety') {
  console.error(`Top priority mismatch: ${topPriority || 'missing'}`);
  process.exit(1);
}

if (!tuning.gentleResetMode?.enabled) {
  console.error('Gentle_Reset_Mode disabled');
  process.exit(1);
}

if (!tuning.griotPriority?.enabled || !tuning.griotPriority?.activeDuringMentorship) {
  console.error('Griot narrative priority not active for mentorship');
  process.exit(1);
}

if (tuning.samInterface?.mode !== 'Griot_Narrative_First') {
  console.error('S.A.M. interface not tuned to Griot_Narrative_First');
  process.exit(1);
}

console.log('TRAUMA_AWARE_STACK: TOP_PRIORITY');
console.log('Gentle_Reset_Mode: ENABLED');
console.log('S.A.M.: Griot_Narrative_First');
console.log('VALIDATION: VETERAN_MENTORSHIP_PRIORITY');
