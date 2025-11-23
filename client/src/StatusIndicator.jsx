import React from 'react';

const StatusIndicator = ({ username, isAuthenticated }) => {
    return (
        <div className="system-status-panel">
            <div className="panel-title">SYSTEM STATUS</div>
            <p className="status-user">User: **{username}**</p>
            <p className="status-link">Database Link: **ONLINE**</p>
            <p className={`status-auth status-${isAuthenticated ? 'online' : 'offline'}`}>
                Authentication: **{isAuthenticated ? 'ONLINE' : 'OFFLINE (Security Risk)'}**
            </p>
            <hr className="sub-divider" />
        </div>
    );
};

export default StatusIndicator;
