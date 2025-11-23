// File: client/src/App.jsx

import React from 'react';
import useProjects from "./hooks/useProjects";
// FINAL FIX: This path must match the ALL LOWERCASE filename in the same directory.
import AddProjectForm from "./addprojectform.jsx"; 

export default function App() {
    const { projects, loading, error, refetch } = useProjects();
    const userName = "Commander Souljah"; 

    const renderProjectList = () => {
        if (loading) {
            return <p className="loading-indicator">Processing data protocols...</p>;
        }

        if (error) {
            return <p className="error-message">Error: {error}</p>;
        }

        if (projects.length === 0) {
            return <p className="status-message">Data log empty. Awaiting new project input.</p>;
        }

        return (
            <ul className="project-list data-output">
                {projects.map((project) => (
                    <li key={project._id}>
                        <span className="project-title">{project.title}</span>
                        <span className="project-status">-- ACTIVE --</span>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="app-container">
            
            <header className="main-header">
                <h1>SYZMEKU ENGINE // OPERATIONAL INTERFACE</h1>
            </header>
            
            <div className="ui-grid">
                {/* -------------------- LEFT PANEL: NAVIGATION & STATUS -------------------- */}
                <div className="ui-panel nav-panel">
                    <h2 className="panel-title">System Status</h2>
                    <div className="status-indicator-box">
                        <p>User: {userName}</p>
                        <p className="system-status active">Database Link: ONLINE</p>
                        <p className="system-status active">Authentication: OFFLINE (Security Risk)</p>
                    </div>

                    <h2 className="panel-title">Navigation</h2>
                    <nav>
                        <ul>
                            <li><button>ACCESS: Dashboard</button></li>
                            <li><button>ACCESS: Projects</button></li>
                            <li><button>CONFIG: Settings</button></li>
                            <hr />
                            <li><button className="logout-button">LOGOUT: Terminate Session</button></li>
                        </ul>
                    </nav>
                </div>

                {/* -------------------- RIGHT PANEL: MAIN DATA / ACTIONS -------------------- */}
                <div className="ui-panel data-panel">
                    
                    <div className="action-module">
                        <h2 className="panel-title">Data Input Protocol</h2>
                        <AddProjectForm onProjectAdded={refetch} />
                    </div>

                    <hr className="divider" />
                    
                    <div className="data-display-module">
                        <h2 className="panel-title">Project Log ({projects.length})</h2>
                        {renderProjectList()}
                    </div>
                </div>
            </div>
        </div>
    );
}
