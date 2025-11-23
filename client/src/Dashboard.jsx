import React from 'react';
import StatusIndicator from './StatusIndicator';
import { useAuth } from './hooks/useAuth.jsx';

const Dashboard = () => {
    const { user, isAuthenticated } = useAuth();
    
    return (
        <div className="action-module dashboard-module">
            <h2 className="panel-title">SYSTEM STATUS OVERVIEW</h2>
            <StatusIndicator username={user ? user.username : 'ACCESS VIOLATION'} isAuthenticated={isAuthenticated} />
            <hr className="divider" />
            
            <div className="dashboard-content">
                <p className="system-status active">USER: {user ? user.username.toUpperCase() : 'UNKNOWN'}</p>
                <p className="system-status">AUTH TOKEN STATUS: ACTIVE (Encrypted)</p>
                <p className="system-status">PROJECT INTERFACE: READY</p>
                <p className="system-status">NEXT PROTOCOL: SECURITY HARDENING (Required)</p>
            </div>
        </div>
    );
};

export default Dashboard;
