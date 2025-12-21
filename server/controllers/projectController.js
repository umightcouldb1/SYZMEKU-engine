const Project = require('../models/Project');

// @desc    Get all projects for the authenticated operative
const getProjects = async (req, res) => {
    const projects = await Project.find({ owner: req.user._id });
    res.status(200).json(projects);
};

// @desc    Get a single project for the authenticated operative
const getProject = async (req, res) => {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id });

    if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
    }

    res.status(200).json(project);
};

// @desc    Create a new project entry
const createProject = async (req, res) => {
    const { title } = req.body;
    if (!title) {
        return res.status(400).json({ message: 'Title required.' });
    }

    const project = await Project.create({
        title,
        owner: req.user._id,
        status: 'ACTIVE',
    });
    res.status(201).json(project);
};

// @desc    Update a project entry
const updateProject = async (req, res) => {
    const project = await Project.findOneAndUpdate(
        { _id: req.params.id, owner: req.user._id },
        req.body,
        { new: true, runValidators: true }
    );

    if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
    }

    res.status(200).json(project);
};

// @desc    Delete a project entry
const deleteProject = async (req, res) => {
    const project = await Project.findOneAndDelete({ _id: req.params.id, owner: req.user._id });

    if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
    }

    res.status(200).json({ message: 'Project removed.' });
};

module.exports = {
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
};
