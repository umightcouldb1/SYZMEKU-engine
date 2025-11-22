// File: client/src/App.jsx
import React from 'react';
import useProjects from './hooks/useProjects';

// Define a simple list component to display the projects
const ProjectList = () => {
    const { projects, isLoading, error, fetchProjects } = useProjects();

    if (isLoading) {
        return <p>Loading projects...</p>;
    }

    if (error) {
        return (
            <div>
                <p style={{ color: 'red' }}>Error: {error}</p>
                <button onClick={fetchProjects}>Try Again</button>
            </div>
        );
    }

    if (projects.length === 0) {
        return <p>No projects found. Add one to get started!</p>;
    }

    return (
        <div>
            <h2>My Projects ({projects.length})</h2>
            <ul>
                {projects.map(project => (
                    <li key={project._id}>
                        <strong>{project.title}</strong> - Managed by {project.owner.username || 'Unknown'}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Main application component
const App = () => {
    return (
        <div>
            <h1>SYZMEKU Engine</h1>

            <h2>Navigation</h2>
            <ul>
                <li>Dashboard</li>
                <li>Projects</li>
                <li>Settings</li>
                <li><button>Log Out (Future)</button></li>
            </ul>
            <hr />

            <ProjectList />
        </div>
    );
};

export default App;
