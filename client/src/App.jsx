// client/src/App.jsx - FINAL PROFESSIONAL LAUNCH CODE

import React, { useState } from 'react';
import './App.css'; 

function App() {
  const [inputMetric, setInputMetric] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- API URL ---
  // NOTE: You MUST replace this with your actual live Render URL.
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
      // The backend API still expects "costOptimized"
      const response = await fetch(`${API_BASE_URL}/api/fixes/protocol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ costOptimized: metricValue }),
      });

      const data = await response.json();

      if (response.ok) {
        setAuditResult(data.proof);
      } else {
        setError(data.message || 'System Check failed.');
      }
    } catch (err) {
      setError('Network error: Could not reach the SYZMEKU Engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>SYZMEKU AI MENTOR // SYSTEMIC COHERENCE</h1>
        <h2>The Core Integrity of Your Vision (Jarvis/Griot Standard)</h2>
      </header>
      
      <main>
        
        {/* Placeholder for professional marketing content like "Discover the hidden risks in your current strategy." */}
        <div className="marketing-pitch">
            <h3>Is Your Strategy Systemically Sound?</h3>
            <p>SYZMEKU prevents the invisible collapse that standard optimization causes. Validate the integrity of your core metrics instantly.</p>
        </div>
        
        {error && <div className="message error">{error}</div>}

        <form onSubmit={handleSystemCheck} className="audit-form">
          <label htmlFor="metric">Enter Your Optimized Metric (e.g., target cost, time, resource limit)</label>
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
            {loading ? 'ENFORCING AXIOM...' : 'RUN SYSTEM INTEGRITY CHECK'} 
          </button>
          <p className="small-text">This paid prototype demonstrates mandatory coherence correction.</p>
        </form>

        {auditResult && (
          <div className="result-box success">
            <h3>✅ SYSTEM COHERENCE REQUIRED</h3>
            <p><strong>Axiom Applied:</strong> {auditResult.axiom_enforced}</p>
            <p><strong>Optimized Input Resulted In:</strong> ${auditResult.old_cost_4D}</p>
            <p className="large-result">
              <strong>Coherent Metric Required for Stability:</strong> ${auditResult.new_coherent_cost_5D}
            </p>
            <p className="risk-eliminated">
              **Failure Risk Mitigation:** Systemic collapse risk eliminated by accepting this correction.
            </p>
          </div>
        )}
      </main>
      
      <footer>
        <p>Powered by the Crystalline Engine. Ensuring systemic integrity and avoiding hidden failure costs.</p>
      </footer>
    </div>
  );
}

export default App;
