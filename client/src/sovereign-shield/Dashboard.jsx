import React from 'react';
import MentorDashboard from '../Dashboard';
import AdminSignaturePanel from '../AdminSignaturePanel';
import SovereignShieldPanel from './SovereignShieldPanel';

export default function SovereignDashboard({ user }) {
  return (
    <div className="sovereign-shield-shell">
      <SovereignShieldPanel />
      <AdminSignaturePanel />
      <MentorDashboard user={user} />
    </div>
  );
}
