const router = require('../utils/asyncRouter')();
const { protect } = require('../middleware/authMiddleware');
const core = require('../services/coreContextService');
router.use(protect);
router.get('/', async (_req,res) => { const {memory,sovereignContext,context}=await core.getConversation();res.json({success:true,conversationHistory:memory.conversationHistory || [],sovereignContext,context,status:'Lineage Sync Established',updatedAt:memory.updatedAt}); });
router.delete('/conversation',async(_req,res)=>{await core.clearConversation();const {sovereignContext}=await core.getConversation();res.json({success:true,conversationHistory:[],sovereignContext,status:'Lineage Sync Established'});});
module.exports=router;
