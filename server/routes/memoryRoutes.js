const router = require('../utils/asyncRouter')();
const { protect } = require('../middleware/authMiddleware');
const core = require('../services/coreContextService');
router.use(protect);
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.post('/guest-conversation', async (req, res) => {
  require('../services/coreScopeService').rejectOwnerFields(req.body);
  if (req.body?.consent !== true || Object.keys(req.body).some(key => !['consent', 'tokens'].includes(key))) {
    return res.status(400).json({ message: 'Confirm that you want to save this conversation to your signed-in account.' });
  }
  const exchanges = require('../services/guestConversationService').verify(req.body.tokens);
  await core.withContextMutation(async () => {
    const Memory = require('../models/Memory');
    const { userId } = require('../services/coreScopeService').requireCoreScope();
    const memory = await Memory.findOne({ userId }) || new Memory({ userId });
    const seen = new Set(memory.guestImportIds || []);
    const turns = [];
    for (const exchange of exchanges) {
      if (seen.has(exchange.id)) continue;
      seen.add(exchange.id);
      turns.push({ role: 'user', text: exchange.question, timestamp: new Date(exchange.iat * 1000) }, { role: 'model', text: exchange.answer, timestamp: new Date(exchange.iat * 1000) });
    }
    if (seen.size > 100) throw require('../services/coreScopeService').scopeError('Guest conversation import limit reached. Continue in your account.', 409);
    if (turns.length) {
      memory.appendConversationTurns(turns);
      memory.guestImportIds = [...seen];
      memory.revision += 1;
      await memory.save();
    }
  }, { evidence: false });
  res.json({ success: true });
});
router.get('/', async (_req,res) => { const {memory,sovereignContext,context}=await core.getConversation();res.json({success:true,conversationHistory:memory.conversationHistory || [],sovereignContext,context,status:'Lineage Sync Established',updatedAt:memory.updatedAt}); });
router.delete('/conversation',async(_req,res)=>{await core.clearConversation();const {sovereignContext}=await core.getConversation();res.json({success:true,conversationHistory:[],sovereignContext,status:'Lineage Sync Established'});});
module.exports=router;
