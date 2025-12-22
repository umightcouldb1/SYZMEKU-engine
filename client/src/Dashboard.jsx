import React from 'react';
import StatusIndicator from './StatusIndicator';
import { useAuth } from './hooks/useAuth.jsx';
import AxiomAuditForm from './AxiomAuditForm';
import { glyphResonanceMap } from './constants/glyphMap';

const Dashboard = () => {
    const { user, isAuthenticated, loading } = useAuth() ?? {};

    if (loading) {
        return <div className="portal-text">SYNCHRONIZING ESSENCE...</div>;
    }

    if (!user) {
        return null;
    }

    return (
        <div className="action-module dashboard-module">
            <h2 className="panel-title">SYSTEM STATUS OVERVIEW</h2>
            <StatusIndicator username={user.username} isAuthenticated={isAuthenticated} />
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
        </div>
    );
};

export default Dashboard;
