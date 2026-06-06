import React from 'react';
import MentorDashboard from '../Dashboard';
import SovereignShieldPanel from './SovereignShieldPanel';

export default function SovereignDashboard({ user }) {
  return (
    <div className="sovereign-shield-shell">
      <SovereignShieldPanel />
      <MentorDashboard user={user} />
    </div>
  );
}
