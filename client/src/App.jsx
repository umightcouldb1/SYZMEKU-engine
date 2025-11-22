// File: client/src/App.jsx
import React from 'react';
import useProjects from './hooks/useProjects';
// FIX: Using the explicit relative path with file extension
import AddProjectForm from './components/AddProjectForm.jsx'; 

// Define a simple list component to display the projects
const ProjectList = ({ fetchProjects }) => {
    // The useProjects hook is called here to access the data and loading state
    const { projects, isLoading, error } = useProjects(); 

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
                        <strong>{project.title}</strong> - Managed by {project.owner?.username || 'Unknown'}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Main application component
const App = () => {
    // Call useProjects once here to get the refetch function
    const { fetchProjects: refetchProjects } = useProjects(); 

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

            {/* Add the form and pass the refetchProjects function */}
            <AddProjectForm onProjectAdded={refetchProjects} />

            {/* Pass the refetch function down to the list component */}
            <ProjectList fetchProjects={refetchProjects} />
        </div>
    );
};

export default App;
