const {hash} = require('./qa');
const {ORIGINAL_LOGO_FILE_ID} = require('./driveMedia');
const VERSION = 'FOUNDER_REFERENCE_IMAGES_V1';
const CONTRACT = Object.freeze({
  version: VERSION,
  source: 'Original family-designed T.O.I. logo and founder-selected images',
  originalLogoFileId: ORIGINAL_LOGO_FILE_ID,
  philosophy: 'Preserve the original logo geometry. Black/charcoal, metallic silver/white, deep green and deep purple, with restrained iridescent reflected light.',
  limits: 'The founder selects actual images before video production. Color checks or old generated SVGs do not establish creative approval.',
});
function pendingImages(p) {
  p.visual = {...CONTRACT, status:'IMAGE_SELECTION_REQUIRED'};
  p.scenes = p.scenes.map(s=>({...s,asset:'Founder-selected Drive image required; no automatic visual substitute.',visual:{status:'IMAGE_SELECTION_REQUIRED'}}));
  if(p.cover) p.cover={text:p.cover.text,style:CONTRACT.philosophy};
  p.production = {...p.production, visualBrief:CONTRACT.philosophy, imageApproval:null, media:null, review:null, status:'IMAGE_SELECTION_REQUIRED'};
  return p;
}
function selectionHash({reference,images}) {
  return hash({reference:{fileId:reference.fileId,sha256:reference.sha256},images:images.map(i=>({sceneIndex:i.sceneIndex,fileId:i.fileId,sha256:i.sha256}))});
}
module.exports = {VERSION,CONTRACT,pendingImages,selectionHash};
