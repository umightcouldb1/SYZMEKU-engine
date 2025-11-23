import React, { useState } from 'react';
import Dashboard from './Dashboard';
import AddProjectForm from './addprojectform.jsx'; 
import ProjectList from './ProjectList';
import { useAuth } from './hooks/useAuth.jsx'; 
import AuthScreen from './AuthScreen'; 

const App = () => {
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const { isAuthenticated, user, logout } = useAuth(); 
  
  // NOTE: If isAuthenticated is false, render AuthScreen
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Ensure user object is present before trying to access username
  const username = user?.username || 'UNKNOWN';

  return (
    <div className="app-container">
      <div className="main-header">
        <h1>SYZMEKU ENGINE // OPERATIONAL INTERFACE</h1>
      </div>
      <div className="ui-grid">
        <div className="ui-panel nav-panel">
          
          {/* StatusIndicator now uses the user state directly */}
          {/* NOTE: If isAuthenticated is true, user MUST exist, but we pass the derived value */}
          <StatusIndicator username={username} isAuthenticated={isAuthenticated} /> 
          
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
              <li>
                <button onClick={() => setCurrentView('SETTINGS')}>
                  CONFIG: SETTINGS 
                </button>
              </li>
              {/* Logout button is now styled via index.css classes for visibility */}
              <li>
                <button className="nav-button logout-button" onClick={logout}>
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
              <ProjectList />
            </>
          )}
          {currentView === 'SETTINGS' && (
            <div className="panel-title">SETTINGS // PROTOCOL CONFIG</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
