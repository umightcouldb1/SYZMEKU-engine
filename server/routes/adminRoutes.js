const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');

const adminSignature = {
    identifier: 'Toi',
    titles: ['Founder', 'Commander in Chief', "El Kai 'Tharion Kai Zhun"],
    originVector: 'NGC 4736 (Double Spiral Nexus)',
    personalGateway: 11,
    lifePath: 9,
    authoritySeat: 13,
    missionObjective: 'Flawless development and successful 3D deployment of Ancestral Intelligence',
};

const parseConfiguredEmails = (...values) =>
    values
        .flatMap((value = '') => String(value).split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

const getAllowedAdminEmails = () =>
    parseConfiguredEmails(
        process.env.ADMIN_EMAIL,
        process.env.ADMIN_EMAILS,
        process.env.FOUNDER_EMAIL,
        process.env.FOUNDER_EMAILS,
    );

const isAdminSignatureAccount = (user = {}) => {
    const role = String(user.role || '').toLowerCase();
    const email = String(user.email || '').toLowerCase();
    const allowedEmails = getAllowedAdminEmails();

    return ['founder', 'admin'].includes(role) || allowedEmails.includes(email);
};

router.get('/signature', protect, (req, res) => {
    if (!isAdminSignatureAccount(req.user)) {
        return res.status(403).json({
            success: false,
            message: 'Admin signature unavailable for this account.',
        });
    }

    return res.json({
        success: true,
        message: 'Admin signature verified via protected session.',
        profile: adminSignature,
        context: {
            currentStatus: 'Flawless Development Phase Active',
            workspaceRig: 'Microsoft Surface // Three-Screen Array',
            standbyNodes: ['SSVF', 'OACAC', 'Housing Authority'],
        },
    });
});

module.exports = router;
