// client/src/App.jsx - FINAL REVENUE PROTOTYPE CODE (Banner Restored)

import React, { useState } from 'react';
import './App.css'; 

function App() {
  const [costOptimized, setCostOptimized] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- API URL ---
  // NOTE: You MUST replace this with your actual live Render URL.
  const API_BASE_URL = 'https://syzmeku-api.onrender.com'; 
  // -----------------------------

  const handleAudit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuditResult(null);
    setError(null);

    const costValue = parseFloat(costOptimized);
    if (isNaN(costValue) || costValue <= 0) {
      setError('Please enter a positive numeric value for the 4D Cost.');
      setLoading(false);
      return;
    }

    try {
      // NOTE: Payment logic is now assumed to be handled externally before this call.
      console.log(`Payment assumed successful. Calling Axiom Fixes Protocol...`);

      // Step 2: Call the validated Axiom Fixes Protocol endpoint
      const response = await fetch(`${API_BASE_URL}/api/fixes/protocol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ costOptimized: costValue }),
      });

      const data = await response.json();

      if (response.ok) {
        setAuditResult(data.proof);
      } else {
        setError(data.message || 'Audit failed due to server error.');
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
        <h1>SYZMEKU AI MENTOR // COHERENCE AUDIT</h1>
        <h2>The Core 5D Axiom Test (Jarvis/Griot Integrity Check)</h2>
      </header>
      
      <main>
        {/* RE-INTRODUCED BANNER WITH CLEAN TEXT */}
        <div className="flash-sale-banner">
            <h3>⏳ LIMITED TIME ACCESS: ENFORCE COHERENCE NOW ⚡</h3>
        </div>
        
        {error && <div className="message error">{error}</div>}

        <form onSubmit={handleAudit} className="audit-form">
          <label htmlFor="cost">Enter Your 4D Optimized Cost/Metric (e.g., 2777777.78)</label>
          <input
            id="cost"
            type="number"
            step="0.01"
            value={costOptimized}
            onChange={(e) => setCostOptimized(e.target.value)}
            placeholder="e.g., 2777777.78"
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'ENFORCING AXIOM...' : 'RUN COHERENCE AUDIT (PAID ACCESS)'}
          </button>
          <p className="small-text">Prototype feature. Bypasses standard authentication.</p>
        </form>

        {auditResult && (
          <div className="result-box success">
            <h3>✅ AXIOM ENFORCEMENT SUCCESSFUL</h3>
            <p><strong>Axiom Applied:</strong> {auditResult.axiom_enforced} (Steward Archetype)</p>
            <p><strong>4D Flawed Input:</strong> ${auditResult.old_cost_4D}</p>
            <p className="large-result">
              <strong>5D Coherent Metric Required:</strong> ${auditResult.new_coherent_cost_5D}
            </p>
            <p className="risk-eliminated">
              **Systemic Risk Eliminated:** {auditResult.risk_eliminated} (by accepting ${auditResult.cost_increase_amount})
            </p>
          </div>
        )}
      </main>
      
      <footer>
        {/* CORRECT FOOTER WITHOUT REVENUE GOALS */}
        <p>Powered by the Crystalline Engine. Ensuring systemic integrity and avoiding hidden failure costs.</p>
      </footer>
    </div>
  );
}

export default App;
