// --- FILE: server/routes/API/projectRoutes.js (CLEANED) ---
const express = require('express');
const router = express.Router();
const { 
    getProjects, 
    getProject, 
    createProject, 
    updateProject, 
    deleteProject 
} = require('../../controllers/projectController');
const { protect } = require('../../middleware/authMiddleware');

// All project routes are protected (require authentication)
router.use(protect); // Applies the middleware to all routes below

// Combined routes:
router.route('/')
    .get(getProjects)     // GET /api/projects
    .post(createProject); // POST /api/projects

router.route('/:id')
    .get(getProject)      // GET /api/projects/:id
    .put(updateProject)   // PUT /api/projects/:id
    .delete(deleteProject); // DELETE /api/projects/:id

module.exports = router;
