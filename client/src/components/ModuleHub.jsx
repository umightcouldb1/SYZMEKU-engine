import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './ModuleHub.css';

const MODULE_FORMS = {
  electroculture: [
    { name: 'crop', label: 'Crop or bed focus', placeholder: 'Tomatoes, peppers, herbs' },
    { name: 'bedLengthFt', label: 'Bed length in feet', type: 'number', placeholder: '24' },
    { name: 'bedWidthFt', label: 'Bed width in feet', type: 'number', placeholder: '4' },
    { name: 'soilMoisture', label: 'Current soil moisture', placeholder: 'Dry top inch, moist below' },
    { name: 'intent', label: 'Primary intent', placeholder: 'Improve vigor without synthetic inputs' },
  ],
  'closed-loop-agriculture': [
    { name: 'crop', label: 'Crop or production system', placeholder: 'Leafy greens, nursery starts, herbs' },
    { name: 'waterSource', label: 'Water source', placeholder: 'Rain barrel, tap, well, condensate' },
    { name: 'wasteStream', label: 'Waste stream to recover', placeholder: 'Kitchen scraps, spent leaves, runoff' },
    { name: 'growthStage', label: 'Growth stage', placeholder: 'Seedling, vegetative, fruiting' },
    { name: 'constraint', label: 'Current constraint', placeholder: 'Space, budget, heat, water, pests' },
  ],
};

const DEFAULT_MODULE_ID = 'electroculture';

const buildInitialPayload = (moduleId) =>
  Object.fromEntries((MODULE_FORMS[moduleId] || []).map((field) => [field.name, '']));

export default function ModuleHub() {
  const { ensureValidSession } = useAuth();
  const [modules, setModules] = useState([]);
  const [activeModuleId, setActiveModuleId] = useState(DEFAULT_MODULE_ID);
  const [payload, setPayload] = useState(() => buildInitialPayload(DEFAULT_MODULE_ID));
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('Loading module registry...');
  const [loading, setLoading] = useState(false);

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) || modules[0],
    [activeModuleId, modules],
  );
  const fields = MODULE_FORMS[activeModule?.id] || [];

  useEffect(() => {
    let cancelled = false;

    const loadModules = async () => {
      try {
        const token = await ensureValidSession();
        const response = await axios.get('/api/modules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;

        const registry = response.data?.modules || [];
        setModules(registry);
        const nextModuleId = registry[0]?.id || DEFAULT_MODULE_ID;
        setActiveModuleId(nextModuleId);
        setPayload(buildInitialPayload(nextModuleId));
        setStatus(`${registry.length} academy modules online.`);
      } catch (error) {
        if (!cancelled) {
          setStatus(error?.response?.data?.message || 'Module registry is not available yet.');
        }
      }
    };

    loadModules();

    return () => {
      cancelled = true;
    };
  }, [ensureValidSession]);

  const selectModule = (moduleId) => {
    setActiveModuleId(moduleId);
    setPayload(buildInitialPayload(moduleId));
    setAnalysis(null);
  };

  const updatePayload = (field, value) => {
    setPayload((current) => ({ ...current, [field]: value }));
  };

  const runAnalysis = async () => {
    if (!activeModule) return;

    setLoading(true);
    setStatus('Running academy module...');

    try {
      const token = await ensureValidSession();
      const response = await axios.post('/api/modules/analyze', {
        moduleId: activeModule.id,
        payload,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setAnalysis(response.data?.analysis || null);
      setStatus(`Analysis generated for ${activeModule.name}.`);
    } catch (error) {
      setStatus(error?.response?.data?.message || 'Module analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="module-hub-shell" aria-label="T.O.I. Souljah Academy module hub">
      <header className="module-hub-header">
        <div>
          <p className="module-eyebrow">T.O.I. Souljah Academy Systems</p>
          <h1>Operational Intelligence Modules</h1>
          <p>
            Use protected academy tools for electroculture planning, closed-loop agriculture mapping,
            and module-specific guidance while the private local core stays sealed.
          </p>
        </div>
        <div className="module-header-actions">
          <Link className="module-button secondary" to="/catalog">Manage subscription</Link>
          <Link className="module-button secondary" to="/app">Back to Big SYZ</Link>
        </div>
      </header>

      <section className="module-status-row" role="status">
        <span>{status}</span>
      </section>

      <section className="module-hub-layout">
        <aside className="module-list" aria-label="Available modules">
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              className={`module-list-item${module.id === activeModule?.id ? ' active' : ''}`}
              onClick={() => selectModule(module.id)}
            >
              <span>{module.category}</span>
              <strong>{module.name}</strong>
              <small>{module.description}</small>
            </button>
          ))}
        </aside>

        <section className="module-workbench">
          <div className="module-card module-form-card">
            <p className="module-section-label">Input Matrix</p>
            <h2>{activeModule?.name || 'Module pending'}</h2>
            <p>{activeModule?.description}</p>

            <div className="module-form-grid">
              {fields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  <input
                    type={field.type || 'text'}
                    value={payload[field.name] || ''}
                    placeholder={field.placeholder}
                    onChange={(event) => updatePayload(field.name, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <button type="button" className="module-button" onClick={runAnalysis} disabled={loading || !activeModule}>
              {loading ? 'Generating...' : 'Generate Module Plan'}
            </button>
          </div>

          <div className="module-card module-output-card">
            <p className="module-section-label">Big Sis Module Output</p>
            {analysis ? (
              <>
                <h2>{analysis.title}</h2>
                <p className="module-summary">{analysis.summary}</p>
                <div className="module-metric-grid">
                  {Object.entries(analysis.metrics || {}).map(([key, value]) => (
                    <div key={key}>
                      <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
                <ol className="module-action-list">
                  {(analysis.nextActions || []).map((action) => <li key={action}>{action}</li>)}
                </ol>
                <p className="module-caution">{analysis.caution}</p>
              </>
            ) : (
              <>
                <h2>Awaiting module run</h2>
                <p>
                  Fill the active module fields and generate a plan. The response is calculated by the
                  cloud app and can later be synced to the private local ARC Codex core by an approved webhook.
                </p>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
