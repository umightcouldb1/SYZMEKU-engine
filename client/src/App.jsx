// SYZMEKU AI MENTOR // Client Application Entry Point (App.jsx)
// This file renders the main component, correcting the input type to "text".

import React, { useState } from 'react';
import './App.css'; // Assuming standard CSS import

// Component for the Audit Form (Simulated for replacement)
const AxiomAuditForm = () => {
    const [goalMetric, setGoalMetric] = useState('');
    const [loading, setLoading] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [error, setError] = useState(null);

    // Placeholder for your live Render API URL
    const API_ENDPOINT = 'https://syzmeku-api.onrender.com/api/payment/audit-checkout';

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

        // --- Payment/API Integration Placeholder ---
        // In the final integrated system, this form is replaced by the UENI embed.
        // This component fix is for when the Render URL is accessed directly.

        try {
            console.log("Goal Metric submitted (as text):", goalMetric);
            
            // Simulating API call for audit proof
            // In the live system, the UENI embed handles the payment and sends the metric/token.
            // This is simply to show the text input is now possible.
            
            // Simulate success
            setAuditResult({
                initial_flawed_offering: goalMetric,
                true_energetic_investment_required: "5D Target (e.g., $3,277,777.78)"
            });
            
        } catch (err) {
            setError("An error occurred. Check server logs.");
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
                
                {/* >>> CRUCIAL FIX: Input type changed from "number" to "text" <<< */}
                <input 
                    id="goal-metric"
                    type="text" // Corrected to allow text input
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
                    <p><strong>Initial $\text{4D}$ Input:</strong> {auditResult.initial_flawed_offering}</p>
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
