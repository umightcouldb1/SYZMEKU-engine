const router = require('express').Router();
const protect = require('../../middleware/authMiddleware');

// @route GET /api/projects
// @desc Get all projects for the authenticated user
// @access Private (Uses mocked protect middleware)
router.get('/', protect, (req, res) => {
    // CRITICAL FIX: Returning a valid JSON object to prevent the client from crashing on load.
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
// @desc Create a new project
// @access Private
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
