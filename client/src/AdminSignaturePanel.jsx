import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AdminSignaturePanel = () => {
  const [signature, setSignature] = useState(null);

  useEffect(() => {
    let mounted = true;

    axios.get('/api/admin/signature')
      .then((response) => {
        if (mounted && response.data?.success) {
          setSignature(response.data);
        }
      })
      .catch(() => {
        if (mounted) {
          setSignature(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!signature?.profile) return null;

  const { profile, context } = signature;

  return (
    <section className="mentor-card mentor-admin-signature-card">
      <p className="mentor-section-label">Sovereign Admin Signature</p>
      <h2>Welcome back, Commander {profile.identifier}</h2>
      <p className="mentor-admin-title-line">{profile.titles.join(' // ')}</p>
      <p>
        Origin: {profile.originVector} | Throne Seat: {profile.authoritySeat}
      </p>
      <p className="mentor-muted">Current Directive: {profile.missionObjective}</p>
      {context?.currentStatus && (
        <div className="mentor-admin-context-row">
          <span className="mentor-pill success">{context.currentStatus}</span>
          <span className="mentor-pill">Gateway {profile.personalGateway}</span>
          <span className="mentor-pill">Life Path {profile.lifePath}</span>
        </div>
      )}
    </section>
  );
};

export default AdminSignaturePanel;
