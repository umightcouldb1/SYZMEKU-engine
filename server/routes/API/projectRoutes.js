// File: server/routes/API/projectRoutes.js
const router = require('express').Router();
// FIX: Ensure BOTH Project and User models are required to register User schema
const { Project, User } = require('../../models'); 

// ... Routes prefixed with /api/projects

// GET all projects and POST a new project
router.route('/')
.get(async (req, res) => {
    try {
        const projects = await Project.find().populate('owner');
        res.status(200).json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json(error);
    }
})
.post(async (req, res) => {
    try {
        // This relies on the client (AddProjectForm.jsx) sending the 'owner' field
        const newProject = await Project.create({
            ...req.body,
        });

        res.status(200).json(newProject);
    } catch (error) {
        console.error(error);
        res.status(500).json(error);
    }
});

// GET a single project by id
router.route('/:id').get(async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).populate('owner');
        if (!project) {
            return res.status(404).json({ message: 'No project found with this id!' });
        }
        res.status(200).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json(error);
    }
});

// DELETE a project by id
router.route('/:id').delete(async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) {
            return res.status(404).json({ message: 'No project found with this id!' });
        }
        res.status(200).json({ message: 'Project successfully deleted!' });
    } catch (error) {
        console.error(error);
        res.status(500).json(error);
    }
});

module.exports = router;
