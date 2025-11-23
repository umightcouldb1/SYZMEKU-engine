const router = require('express').Router();
const Project = require('../../models/Project');
const User = require('../../models/User'); 
const auth = require('../../middleware/authMiddleware'); 

// @route GET /api/projects
// @access Private 
router.get('/', auth, async (req, res) => {
    try {
        const projects = await Project.find({ owner: req.user.id }).populate('owner', 'username email');
        res.status(200).json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error retrieving projects' });
    }
});

// @route POST /api/projects
// @access Private
router.post('/', auth, async (req, res) => {
    const { title } = req.body;
    const owner = req.user.id; 

    try {
        const newProject = await Project.create({
            title,
            owner
        });
        
        await User.findByIdAndUpdate(owner, { $push: { projects: newProject._id } });

        res.status(201).json(newProject);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error creating project' });
    }
});

module.exports = router;
