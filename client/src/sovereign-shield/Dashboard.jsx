import React from 'react';
import MentorDashboard from '../Dashboard';
import AdminSignaturePanel from '../AdminSignaturePanel';
import SovereignShieldPanel from './SovereignShieldPanel';

export default function SovereignDashboard({ user }) {
  return (
    <div className="sovereign-shield-shell">
      {user?.role === 'COMMANDER_IN_CHIEF' && <nav aria-label="Private business tools"><a href="/app/commander">Open Commander business brief</a></nav>}
      <SovereignShieldPanel />
      <AdminSignaturePanel />
      <MentorDashboard user={user} />
    </div>
  );
}
