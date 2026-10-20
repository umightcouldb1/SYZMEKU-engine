const {PHASES,evidenceFor}=require('../services/freedomAuditPlan');
module.exports = function plan(a) {
 const e=evidenceFor(a);
 const refs=['win','drag','asset',a.weakestDomain+'.1','win','drag'];
 const actions=[`Define one small milestone toward ${a.win}.`,`List one recurring task contributing to ${a.drag} and propose a reversible reduction.`,`Create a small reusable draft using ${a.asset}.`,`Try the draft once and record what helps your ${a.weakestDomain} constraint.`,`Compare the trial with your intended outcome: ${a.win}.`,`Repeat the assessment and review the remaining friction: ${a.drag}.`];
 return {priority:`Start with ${a.weakestDomain} and a small milestone toward ${a.win}.`,moves:[`Define a milestone for ${a.win}.`,`List one task related to ${a.drag}.`,`Inventory the usable parts of ${a.asset}.`],compression:{delete:'Remove one optional duplicate task after checking its consequences.',automate:'Draft a reusable checklist for one repeated task.',delegate:'Ask whether someone can help; confirm availability before assigning.',execute:'Complete the smallest milestone and record the result.'},plan:PHASES.map((phase,i)=>({phase,action:actions[i],checkpoint:`Record ${i+1} observations in your review notes.`,evidence:[{id:refs[i],quote:e[refs[i]]}]}))};
};
