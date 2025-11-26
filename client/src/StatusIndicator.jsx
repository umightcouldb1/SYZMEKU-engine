import React from 'react';

const StatusIndicator = ({ username, isAuthenticated }) => {
    return (
        <div className="system-status-panel">
            <div className="panel-title">SYSTEM STATUS</div>
            <p className="status-user">User: <strong>{username}</strong></p>
            <p className="status-link">Database Link: <strong>ONLINE</strong></p>
            <p className={`status-auth status-${isAuthenticated ? 'online' : 'offline'}`}>
                Authentication: <strong>{isAuthenticated ? 'ONLINE' : 'OFFLINE (Security Risk)'}</strong>
            </p>
            <hr className="sub-divider" />
        </div>
    );
};

export default StatusIndicator;
