// --- FILE: server/routes/API/projectRoutes.js (REAL) ---
JavaScript

const router = require('express').Router();
const protect = require('../../middleware/authMiddleware'); // For protected routes
const Project = require('../../models/projectModel'); // Import Project Model

// @desc    Get all projects for the logged-in user
// @route   GET /api/projects
// @access  Private (Requires JWT token)
router.get('/', protect, async (req, res) => {
    try {
        // Find projects where the 'user' field matches the authenticated user's ID
        const projects = await Project.find({ user: req.user.id });

        res.status(200).json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ message: 'Server error while fetching projects.' });
    }
});

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private (Requires JWT token)
router.post('/', protect, async (req, res) => {
    const { title } = req.body;

    if (!title) {
        res.status(400).json({ message: 'Please add a title for the project.' });
        return;
    }

    try {
        // Create the new project, automatically setting the 'user' field
        const project = await Project.create({
            title,
            user: req.user.id, // Set the owner ID from the authenticated user
            status: 'ACTIVE', // Default status
        });

        res.status(201).json(project);
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ message: 'Server error while creating project.' });
    }
});

// @desc    Update a project by ID
// @route   PUT /api/projects/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            res.status(404).json({ message: 'Project not found' });
            return;
        }

        // Security Check: Make sure the logged-in user is the project owner
        if (project.user.toString() !== req.user.id) {
            res.status(401).json({ message: 'Not authorized to update this project' });
            return;
        }

        const updatedProject = await Project.findByIdAndUpdate(
            req.params.id,
            req.body, // The update data comes from the request body
            { new: true } // { new: true } returns the updated document
        );

        res.status(200).json(updatedProject);
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ message: 'Server error while updating project.' });
    }
});

// @desc    Delete a project by ID
// @route   DELETE /api/projects/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            res.status(404).json({ message: 'Project not found' });
            return;
        }

        // Security Check: Make sure the logged-in user is the project owner
        if (project.user.toString() !== req.user.id) {
            res.status(401).json({ message: 'Not authorized to delete this project' });
            return;
        }

        await Project.deleteOne({ _id: req.params.id });

        res.status(200).json({ id: req.params.id, message: 'Project successfully deleted' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ message: 'Server error while deleting project.' });
    }
});


module.exports = router;
