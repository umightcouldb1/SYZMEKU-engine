// client/src/App.jsx - FINAL OCCULT/MASTERY LAUNCH CODE (Simple Instructions)

import React, { useState } from 'react';
import './App.css'; 

function App() {
  const [inputMetric, setInputMetric] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- API URL ---
  // IMPORTANT: You MUST replace this URL with your actual live Render URL.
  const API_BASE_URL = 'https://syzmeku-api.onrender.com'; 
  // -----------------------------

  const handleSystemCheck = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuditResult(null);
    setError(null);

    const metricValue = parseFloat(inputMetric);
    if (isNaN(metricValue) || metricValue <= 0) {
      setError('Please enter a valid numeric value for the metric to be checked.');
      setLoading(false);
      return;
    }

    try {
      // NOTE: This call is triggered AFTER payment is processed in the real app.
      const response = await fetch(`${API_BASE_URL}/api/fixes/protocol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ costOptimized: metricValue }),
      });

      const data = await response.json();

      if (response.ok) {
        // Data is received, the Axiom check ran successfully
        setAuditResult(data.proof);
      } else {
        setError(data.message || 'Harmonic Check failed. Contact support.');
      }
    } catch (err) {
      setError('Aetheric blockage: Could not reach the Crystalline Engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>SYZMEKU AI MENTOR // HARMONIC LAW</h1>
        <h2>The Core Integrity of Your Vision (As Above, So Below)</h2>
      </header>
      
      <main>
        
        <div className="marketing-pitch">
            <h3>Is Your Intent Aligned with Universal Law?</h3>
            <p>Validate the true **energetic cost** required for manifestation. SYZMEKU prevents the creation of **Karmic Debt** from shortcuts.</p>
        </div>
        
        {error && <div className="message error">{error}</div>}

        <form onSubmit={handleSystemCheck} className="audit-form">
          <label htmlFor="metric">Enter Your Initial Energetic Offering (Goal Value Based on Limited Effort)</label>
          <input
            id="metric"
            type="number"
            step="0.01"
            value={inputMetric}
            onChange={(e) => setInputMetric(e.target.value)}
            placeholder="e.g., 2777777.78"
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'CALCULATING EQUILIBRIUM...' : 'RUN HARMONIC LAW CHECK'} 
          </button>
          <p className="small-text">This prototype demonstrates the mandatory correction of Karmic Debt.</p>
        </form>

        {auditResult && (
          <div className="result-box success">
            <h3>✅ LAW OF COHERENCE ENFORCED</h3>
            <p><strong>Universal Axiom Applied:</strong> {auditResult.axiom_enforced}</p>
            <p><strong>Initial Flawed Offering:</strong> ${auditResult.old_cost_4D}</p>
            <p className="large-result">
              <strong>True Energetic Investment Required:</strong> ${auditResult.new_coherent_cost_5D}
            </p>
            <p className="risk-eliminated">
              **Karmic Debt Mitigated:** Systemic failure risk eliminated by accepting this correction.
            </p>
          </div>
        )}
      </main>
      
      <footer>
        <p>Powered by the Crystalline Engine. Ensuring systemic integrity and avoiding hidden energetic costs.</p>
      </footer>
    </div>
  );
}

export default App;
