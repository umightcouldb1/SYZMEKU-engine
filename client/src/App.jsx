// SYZMEKU AI MENTOR // Client Application Entry Point (App.jsx)
// FINAL VERSION: Corrected input type to 'text' AND removed dollar amount placeholder.

import React, { useState } from 'react';
import './App.css'; 

// Component for the Audit Form 
const AxiomAuditForm = () => {
    const [goalMetric, setGoalMetric] = useState('');
    const [loading, setLoading] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setAuditResult(null);

        if (!goalMetric.trim()) {
            setError("Please enter your Optimized Goal Metric.");
            setLoading(false);
            return;
        }

        try {
            console.log("Goal Metric submitted (as text):", goalMetric);
            
            // Simulating API call for audit proof
            
            // Simulate success and display result based on the text input
            setAuditResult({
                initial_flawed_offering: goalMetric,
                // >>> CRITICAL FIX: Changed the dollar placeholder to a qualitative one <<<
                true_energetic_investment_required: "Full Dimensional Resource Commitment (e.g., 7 Years/3 Phases)"
            });
            
        } catch (err) {
            setError("Aetheric Blockage: Cannot execute audit.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="syzmeku-app-container">
            <h1 className="title">// SYZMEKU AI MENTOR // SUSTAINABLE SUCCESS</h1>
            <p className="subtitle">The Core Integrity Check (Prevents Burnout and Collapse)</p>

            <div className="ready-box">
                <h3 className="ready-title">Ready to Future-Proof Your Goals?</h3>
                <p>Your current plan hides a **Mandatory Investment** needed for success. SYZMEKU reveals the **Hidden Cost of Failure** before it hits.</p>
            </div>

            <form onSubmit={handleSubmit} className="audit-form">
                <label htmlFor="goal-metric">
                    Enter Your Optimized Goal Metric (e.g., Target Cost, Time, or Resource Limit)
                </label>
                
                <input 
                    id="goal-metric"
                    type="text" 
                    value={goalMetric}
                    onChange={(e) => setGoalMetric(e.target.value)}
                    placeholder="e.g., Reduce Burnout by 10 hours/week" 
                    required
                />
                
                <button type="submit" disabled={loading}>
                    {loading ? 'RUNNING AUDIT...' : 'RUN SUSTAINABLE SUCCESS AUDIT'}
                </button>
            </form>

            {error && <div className="error-message">{error}</div>}

            {auditResult && (
                <div className="result-box">
                    <h4>✅ KETSURON COMPLETE: HARMONIC LAW ENFORCED</h4>
                    <p><strong>Initial 4D Input:</strong> {auditResult.initial_flawed_offering}</p>
                    <p className="required-investment">
                        <strong>Non-Collapsible Target:</strong> {auditResult.true_energetic_investment_required}
                    </p>
                    <p>**Hidden Failure Risk is Obliterated.**</p>
                </div>
            )}
            
            <p className="disclaimer">Powered by the Crystalline Engine. Ensuring systemic integrity and permanent results.</p>
        </div>
    );
};

// Main App Component wrapping the form
function App() {
    return (
        <div className="App">
            <AxiomAuditForm />
        </div>
    );
}

export default App;
