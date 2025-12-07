// client/src/App.jsx - FINAL MARKET-READY LAUNCH CODE

import React, { useState } from 'react';
import './App.css'; 

function App() {
  const [inputMetric, setInputMetric] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- API URL ---
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
        setError(data.message || 'System Check failed. Contact support.');
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
        <h1>SYZMEKU AI MENTOR // SUSTAINABLE SUCCESS</h1>
        <h2>The Core Integrity Check (Prevents Burnout and Collapse)</h2>
      </header>
      
      <main>
        
        <div className="marketing-pitch">
            <h3>Ready to Future-Proof Your Goals?</h3>
            <p>Your current plan hides a **Mandatory Investment** needed for success. SYZMEKU reveals the **Hidden Cost of Failure** before it hits.</p>
        </div>
        
        {error && <div className="message error">{error}</div>}

        <form onSubmit={handleSystemCheck} className="audit-form">
          <label htmlFor="metric">Enter Your Optimized Goal Metric (e.g., Target Cost, Time, or Resource Limit)</label>
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
            {loading ? 'CALCULATING INTEGRITY...' : 'RUN SUSTAINABLE SUCCESS AUDIT'} 
          </button>
          <p className="small-text">This paid audit calculates the required investment for non-collapsible results.</p>
        </form>

        {auditResult && (
          <div className="result-box success">
            <h3>✅ REQUIRED INVESTMENT REVEALED</h3>
            <p><strong>Correction Law Applied:</strong> Systemic Reciprocity</p>
            <p><strong>Optimized Input Resulted In:</strong> ${auditResult.old_cost_4D}</p>
            <p className="large-result">
              <strong>Non-Collapsible Target (Required Investment):</strong> ${auditResult.new_coherent_cost_5D}
            </p>
            <p className="risk-eliminated">
              **Hidden Failure Risk Eliminated:** Systemic collapse is avoided by accepting this correction.
            </p>
          </div>
        )}
      </main>
      
      <footer>
        <p>Powered by the Crystalline Engine. Ensuring systemic integrity and permanent results.</p>
      </footer>
    </div>
  );
}

export default App;
