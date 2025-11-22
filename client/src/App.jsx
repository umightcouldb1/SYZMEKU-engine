import React from 'react';
import useProjects from './hooks/useProjects';
// FIX: The component is confirmed to be in the root src/ directory, a sibling of App.jsx.
import AddProjectForm from './AddProjectForm.jsx'; 

const App = () => {
    // Custom hook to fetch projects and manage state
    const { projects, loading, error, refetchProjects, addProject } = useProjects();

    const renderProjectList = () => {
        if (loading) {
            return <p>Loading projects...</p>;
        }
        if (error) {
            return <p style={{ color: 'red' }}>Error: {error}</p>;
        }
        if (projects.length === 0) {
            return <p>No projects found. Add one to get started!</p>;
        }

        return (
            <ul>
                {projects.map(project => (
                    <li key={project._id}>{project.title}</li>
                ))}
            </ul>
        );
    };

    return (
        <div className="container">
            <h1>SYZMEKU Engine</h1>

            {/* Navigation (Placeholder) */}
            <div className="navigation">
                <h4>Navigation</h4>
                <ul>
                    <li>Dashboard</li>
                    <li>Projects</li>
                    <li>Settings</li>
                    <li><button>Log Out (Future)</button></li>
                </ul>
            </div>
            
            <hr />

            {/* Component to add new projects */}
            <AddProjectForm onProjectAdded={addProject} />
            
            <hr />

            {/* Display projects */}
            <h2>My Projects ({projects.length})</h2>
            {renderProjectList()}
            
        </div>
    );
};

export default App;
