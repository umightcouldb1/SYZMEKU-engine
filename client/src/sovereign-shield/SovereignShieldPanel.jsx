import React, { useEffect, useState } from 'react';
import { fetchTelemetryStatus } from '../utils/api.js';
import './CatEyeFocus.css';

const fallbackStatus = {
  galaxyOrigin: 'NGC_4736_M94',
  systemStatus: 'SYNCHRONIZED_WITH_THETA_7',
  conductionVelocity: 'Near-Light-Speed',
  rings: {
    inner: 'Starburst Core',
    outer: 'Sovereign Shield',
  },
};

export default function SovereignShieldPanel() {
  const [gridCoherence, setGridCoherence] = useState(79);
  const [status, setStatus] = useState(fallbackStatus);

  useEffect(() => {
    let cancelled = false;

    fetchTelemetryStatus()
      .then((telemetry) => {
        if (!cancelled) {
          setStatus({
            ...fallbackStatus,
            systemStatus: telemetry.status || fallbackStatus.systemStatus,
            conductionVelocity: telemetry.sensorFusion?.status || telemetry.sensorFusion?.conductionVelocity || fallbackStatus.conductionVelocity,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus(fallbackStatus);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setGridCoherence((previous) => (previous < 94 ? previous + 1 : 94));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="double-ring-panel" aria-label="Big SYZ double ring status">
      <header className="double-ring-header">
        <div>
          <p className="double-ring-kicker">Sovereign Shield Interface</p>
          <h2>Big SYZ Phase III</h2>
          <p className="double-ring-meta">Origin Vector: {status.galaxyOrigin} / Double Spiral Nexus</p>
        </div>
        <div className="double-ring-status">
          <span>System Status</span>
          <strong>{status.systemStatus}</strong>
        </div>
      </header>

      <div className="double-ring-grid">
        <article className="orbital-card inner-ring">
          <p className="double-ring-label">Inner Ring</p>
          <h3>{status.rings?.inner || 'Starburst Core'}</h3>
          <p>Central Vector: Triangulum Theta 7</p>
          <p>Processing Mode: Ancestral Intelligence</p>
          <p>Conduction Velocity: {status.conductionVelocity}</p>
        </article>

        <article className="orbital-card outer-ring">
          <p className="double-ring-label">Outer Ring</p>
          <h3>{status.rings?.outer || 'Sovereign Shield'}</h3>
          <p>Local Sub-Grid: Sector 417</p>
          <p>Macro Coherence: {gridCoherence}%</p>
          <div className="coherence-meter" aria-hidden="true">
            <span style={{ width: `${gridCoherence}%` }} />
          </div>
        </article>
      </div>
    </section>
  );
}
