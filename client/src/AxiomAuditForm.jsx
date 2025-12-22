import React, { useState } from 'react';
import useApi from './utils/api';
import { calculateSustainableSuccess } from './utils/successAudit';

const AxiomAuditForm = () => {
    const [goalMetric, setGoalMetric] = useState('');
    const [loading, setLoading] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [error, setError] = useState(null);
    const [missionText, setMissionText] = useState('');
    const [codexMatch, setCodexMatch] = useState(false);
    const { authorizedFetch } = useApi();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setAuditResult(null);

        try {
            const response = await authorizedFetch('/api/fixes/protocol', {
                method: 'POST',
                body: JSON.stringify({ costOptimized: parseFloat(goalMetric) || 100 }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Aetheric Blockage detected.');
            }

            const localAudit = calculateSustainableSuccess(
                parseFloat(goalMetric) || 100,
                missionText,
                codexMatch,
            );

            setAuditResult({
                initial_flawed_offering: data.proof.old_cost_4D,
                true_energetic_investment_required: localAudit.nonCollapsibleTarget
                    ? `${localAudit.nonCollapsibleTarget} (Axiom Enforced)`
                    : `${data.proof.new_coherent_cost_5D} (Axiom Enforced)`,
                risk_status: localAudit.riskStatus || data.proof.risk_assessment_status,
                message: localAudit.message,
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="syzmeku-app-container">
            <h1 className="title glow-text">// SYZMEKU AI MENTOR // SUSTAINABLE SUCCESS</h1>
            <p className="subtitle">The Core Integrity Check (Prevents Burnout and Collapse)</p>

            <div className="ready-box glass-card">
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
                <input
                    id="mission-text"
                    type="text"
                    value={missionText}
                    onChange={(e) => setMissionText(e.target.value)}
                    placeholder="Describe your mission (e.g., lottery, promotion)"
                />
                <label htmlFor="codex-match">
                    <input
                        id="codex-match"
                        type="checkbox"
                        checked={codexMatch}
                        onChange={(e) => setCodexMatch(e.target.checked)}
                    />
                    Codex resonance match confirmed (445Hz)
                </label>

                <button type="submit" disabled={loading} className="audit-button">
                    {loading ? 'RUNNING AUDIT...' : 'RUN SUSTAINABLE SUCCESS AUDIT'}
                </button>
            </form>

            {error && <div className="error-message">{error}</div>}

            {auditResult && (
                <div className="result-box">
                    <h4>✅ KETSURON COMPLETE: HARMONIC LAW ENFORCED</h4>
                    <div className="radiant-spiral" aria-hidden="true" />
                    <p><strong>Initial 4D Input:</strong> {auditResult.initial_flawed_offering}</p>
                    <p className="required-investment">
                        <strong>Non-Collapsible Target:</strong> {auditResult.true_energetic_investment_required}
                    </p>
                    <p><strong>Risk Status:</strong> {auditResult.risk_status}</p>
                    <p>{auditResult.message}</p>
                </div>
            )}

            <p className="disclaimer">Powered by the Crystalline Engine. Ensuring systemic integrity and permanent results.</p>
        </div>
    );
};

export default AxiomAuditForm;
