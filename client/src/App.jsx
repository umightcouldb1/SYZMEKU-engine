import React, { useState } from 'react';
import Dashboard from './Dashboard';
import AddProjectForm from './addprojectform.jsx'; 
import ProjectList from './ProjectList';
import StatusIndicator from './StatusIndicator';
import { useAuth } from './hooks/useAuth'; // New Import
import AuthScreen from './AuthScreen'; // New Import

const App = () => {
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const { isAuthenticated, user, logout } = useAuth(); // Destructure auth state

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // --- Authenticated User Interface ---
  return (
    <div className="app-container">
      <div className="main-header">
        <h1>SYZMEKU ENGINE // OPERATIONAL INTERFACE</h1>
      </div>
      <div className="ui-grid">
        <div className="ui-panel nav-panel">
          
          <StatusIndicator username={user.username} isAuthenticated={isAuthenticated} /> 
          
          <nav>
            <div className="panel-title">NAVIGATION</div>
            <ul>
              <li>
                <button onClick={() => setCurrentView('DASHBOARD')}>
                  ACCESS: DASHBOARD
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentView('PROJECTS')}>
                  ACCESS: PROJECTS
                </button>
              </li>
              {/* Future addition for settings */}
              <li>
                <button onClick={() => setCurrentView('SETTINGS')}>
                  CONFIG: SETTINGS 
                </button>
              </li>
              <li>
                <button className="logout-button" onClick={logout}>
                  LOGOUT: TERMINATE SESSION
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div className="ui-panel data-panel">
          {currentView === 'DASHBOARD' && <Dashboard />}
          {currentView === 'PROJECTS' && (
            <>
              <div className="panel-title">DATA INPUT PROTOCOL</div>
              <AddProjectForm />
              <hr className="divider" />
              <div className="panel-title">PROJECT LOG</div>
              <ProjectList />
            </>
          )}
          {currentView === 'SETTINGS' && (
            <div className="panel-title">SETTINGS // PROTOCOL CONFIG</div>
            // Future settings component goes here
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
