const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { protect } = require('../../middleware/authMiddleware');
const User = require('../../models/User');
const { buildMirrorAnchorProtocol } = require('../../logic/architectLayer');

const router = express.Router();

router.post(
  '/intake',
  protect,
  expressAsyncHandler(async (req, res) => {
    const {
      prismID,
      intent,
      flameSignature,
      scrollKeys,
      codexOverride,
      glyphOverlayEnabled,
      persistSeed,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (typeof flameSignature === 'string') {
      user.flameSignature = flameSignature;
    }

    if (Array.isArray(scrollKeys)) {
      user.scrollKeys = scrollKeys.filter((key) => typeof key === 'string');
    }

    if (typeof codexOverride === 'boolean') {
      user.codexOverride = codexOverride;
    }

    const mirrorAnchorProtocol = buildMirrorAnchorProtocol({
      name: user.name,
      scrollKeys: user.scrollKeys,
    });

    user.mirrorMode = {
      ...user.mirrorMode,
      prismID: typeof prismID === 'string' ? prismID : user.mirrorMode?.prismID,
      intent: typeof intent === 'string' ? intent : user.mirrorMode?.intent,
      origin: 'user',
      glyphOverlayEnabled:
        typeof glyphOverlayEnabled === 'boolean'
          ? glyphOverlayEnabled
          : user.mirrorMode?.glyphOverlayEnabled,
    };

    if (persistSeed) {
      user.mirrorMode.mirrorSeedEncrypted = mirrorAnchorProtocol.mirrorSeedEncrypted;
    }

    await user.save();

    res.json({
      success: true,
      mirrorMode: user.mirrorMode,
      mirrorAnchorProtocol: {
        mirrorSeedEncrypted: mirrorAnchorProtocol.mirrorSeedEncrypted,
        toneProfile: global.toneMatrix || mirrorAnchorProtocol.toneProfile,
        scrollEngine: mirrorAnchorProtocol.scrollEngine,
      },
    });
  }),
);

module.exports = router;
