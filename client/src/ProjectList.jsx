import React, { useEffect } from 'react';
import useProjects from './hooks/useProjects';

const ProjectList = () => {
    const { projects, loading, error, fetchProjects } = useProjects();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    if (loading) {
        return <div className="loading-message">ACCESSING PROJECT LOG...</div>;
    }

    if (error) {
        return <div className="error-message">ERROR RETRIEVING PROJECTS: {error.message}</div>;
    }

    if (!projects || projects.length === 0) {
        return <div className="status-message">PROJECT LOG (0): No active projects found.</div>;
    }

    return (
        <div className="project-list-container">
            <div className="panel-title">PROJECT LOG ({projects.length})</div>
            {projects.map((project) => (
                <div key={project._id} className="project-item">
                    <span className="project-title">{project.title}</span>
                    <span className={`project-status ${project.status.toLowerCase()}`}>{project.status}</span>
                </div>
            ))}
        </div>
    );
};

export default ProjectList;
