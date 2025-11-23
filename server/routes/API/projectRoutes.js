const router = require('express').Router();
const protect = require('../../middleware/authMiddleware'); // Requires the mocked middleware

// @route GET /api/projects
router.get('/', protect, (req, res) => {
    // Returns mock project data, matching the structure the client expects.
    res.status(200).json([
        {
            _id: 'mock_project_id_1',
            title: 'Noku',
            status: 'ACTIVE',
            user: req.user.id 
        },
        {
            _id: 'mock_project_id_2',
            title: 'noku',
            status: 'ACTIVE',
            user: req.user.id
        }
    ]);
});

// @route POST /api/projects
router.post('/', protect, (req, res) => {
    // MOCK RESPONSE: Pretends a project was created.
    const { title } = req.body;
    res.status(201).json({
        _id: 'mock_project_new',
        title: title || 'MOCKED NEW PROJECT',
        status: 'ACTIVE',
        user: req.user.id
    });
});

module.exports = router;
