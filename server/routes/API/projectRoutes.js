const router = require('express').Router();
// CORRECT PATH: '../../models' to go up from API/ and up from routes/ to land in server/models/
const { Project } = require('../../models'); 

// --- Routes prefixed with /api/projects ---

// GET all projects and POST a new project
router.route('/')
  .get(async (req, res) => {
    try {
      const projects = await Project.find().populate('owner');
      res.status(200).json(projects);
    } catch (err) {
      console.error(err);
      res.status(500).json(err);
    }
  })
  .post(async (req, res) => {
    try {
      // NOTE: You must manually insert a test User into MongoDB first.
      const testOwnerId = '60c72b2f9f1b2c0015a9b7a0'; // Placeholder ID
      const newProject = await Project.create({ 
          ...req.body, 
          owner: testOwnerId 
      });

      res.status(200).json(newProject);
    } catch (err) {
      console.error(err);
      res.status(400).json(err);
    }
  });

// GET one project, PUT/Update one, and DELETE one
router.route('/:id')
  .get(async (req, res) => {
    try {
      const project = await Project.findById(req.params.id).populate('owner');
      if (!project) {
        return res.status(404).json({ message: 'No project found with this id!' });
      }
      res.status(200).json(project);
    } catch (err) {
      console.error(err);
      res.status(500).json(err);
    }
  })
  .put(async (req, res) => {
    try {
      const updatedProject = await Project.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!updatedProject) {
        return res.status(404).json({ message: 'No project found with this id!' });
      }
      res.status(200).json(updatedProject);
    } catch (err) {
      console.error(err);
      res.status(400).json(err);
    }
  })
  .delete(async (req, res) => {
    try {
      const deletedProject = await Project.findByIdAndDelete(req.params.id);
      if (!deletedProject) {
        return res.status(404).json({ message: 'No project found with this id!' });
      }
      res.status(200).json(deletedProject);
    } catch (err) {
      console.error(err);
      res.status(500).json(err);
    }
  });

module.exports = router;
