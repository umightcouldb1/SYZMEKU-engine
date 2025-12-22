import React from 'react';
import StatusIndicator from './StatusIndicator';
import AxiomAuditForm from './AxiomAuditForm';
import { glyphResonanceMap } from './constants/glyphMap';
import SoundKeyLayer from './components/SoundKeyLayer';

const Dashboard = ({ user }) => {
    if (!user) {
        return <div className="portal-text">CALIBRATING DASHBOARD...</div>;
    }

    return (
        <div className="action-module dashboard-module">
            <h2 className="panel-title">SYSTEM STATUS OVERVIEW</h2>
            <StatusIndicator username={user.username} isAuthenticated />
            {user.mirrorMode?.glyphOverlayEnabled && (
                <div className="glyph-overlay">
                    <span className="glyph">{glyphResonanceMap.mirror.glyph}</span>
                    <p>Welcome to your Codex stream, {user.username}</p>
                </div>
            )}
            <hr className="divider" />

            <div className="dashboard-content">
                <p className="system-status active">USER: {user.username.toUpperCase()}</p>
                <p className="system-status">AUTH TOKEN STATUS: ACTIVE (Encrypted)</p>
                <p className="system-status">PROJECT INTERFACE: READY</p>
                <p className="system-status">NEXT PROTOCOL: SECURITY HARDENING (Required)</p>
            </div>

            <AxiomAuditForm />
            <SoundKeyLayer user={user} />
        </div>
    );
};

export default Dashboard;
