import React, { useMemo, useState } from 'react';
import useEvolutionaryState from '../../hooks/useEvolutionaryState';
import './SovereignDashboard.css';

const COMMANDER_ROLE = 'COMMANDER_IN_CHIEF';

const DEFAULT_ASSETS = [
  {
    _id: 'asset-template-1',
    name: 'Greene County Anchor Node',
    category: 'REAL_ESTATE',
    status: 'CONCEPTUAL',
    location: {
      coordinates: [-83.9469, 39.6974],
      county: 'Greene',
      address: 'Location vector pending',
    },
    notes: 'Primary geographic transition marker.',
  },
  {
    _id: 'asset-template-2',
    name: 'Botanical Signal Grid',
    category: 'BOTANICAL',
    status: 'CONCEPTUAL',
    location: {
      coordinates: [-83.9469, 39.6974],
      county: 'Greene',
      address: 'Cultivation boundary pending',
    },
    notes: 'Electroculture and acoustic tuning placeholder.',
  },
  {
    _id: 'asset-template-3',
    name: 'Equipment Readiness Bay',
    category: 'EQUIPMENT',
    status: 'CONCEPTUAL',
    location: {
      coordinates: [-83.9469, 39.6974],
      county: 'Greene',
      address: 'Operational staging pending',
    },
    notes: 'Tooling, transport, and field readiness container.',
  },
  {
    _id: 'asset-template-4',
    name: 'Logistics Transfer Corridor',
    category: 'LOGISTICS',
    status: 'CONCEPTUAL',
    location: {
      coordinates: [-83.9469, 39.6974],
      county: 'Greene',
      address: 'Route geometry pending',
    },
    notes: 'Movement sequence for documents, supplies, and location shifts.',
  },
];

const DEFAULT_MILESTONES = [
  {
    _id: 'milestone-template-1',
    title: 'Sovereign Core Data Layer Anchored',
    targetDate: '2026-06-09',
    category: 'SYSTEM_UPGRADE',
    status: 'ANCHORED',
    description: 'Dormant data layer established behind stealth RBAC perimeter.',
    executionSteps: ['RBAC perimeter', 'Dormant models', 'Controller layer'],
    isCriticalThreshold: false,
  },
  {
    _id: 'milestone-template-2',
    title: 'July Threshold Preparation',
    targetDate: '2026-07-12',
    category: 'SOLAR_RETURN',
    status: 'PENDING',
    description: 'Critical timeline marker for estate, lineage, and relocation planning.',
    executionSteps: ['Confirm legal sequence', 'Anchor asset nodes', 'Review logistics'],
    isCriticalThreshold: true,
  },
];

const categoryLabels = {
  REAL_ESTATE: 'Real Estate',
  EQUIPMENT: 'Equipment',
  BOTANICAL: 'Botanical',
  LOGISTICS: 'Logistics',
};

const statusLabels = {
  CONCEPTUAL: 'Conceptual',
  ACQUISITION: 'Acquisition',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  ANCHORED: 'Anchored',
};

const formatCoordinate = (value) => {
  if (!Number.isFinite(Number(value))) return 'Pending';
  return Number(value).toFixed(4);
};

const formatDate = (value) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
};

const getUserRole = (user) => user?.role || user?.user?.role || '';

const getLayoutClass = (layoutFocus, layoutPriority) => {
  if (layoutFocus === 'timeline' || layoutPriority === 'TIMELINE_FIRST') return 'sovereign-dashboard__layout--timeline-priority';
  if (layoutFocus === 'assets' || layoutPriority === 'ASSET_FIRST') return 'sovereign-dashboard__layout--asset-priority';
  return 'sovereign-dashboard__layout--balanced';
};

const SovereignDashboard = ({ user, assets = DEFAULT_ASSETS, milestones = DEFAULT_MILESTONES }) => {
  const role = getUserRole(user);
  const [assetCategory, setAssetCategory] = useState('ALL');
  const [layoutFocus, setLayoutFocus] = useState('balanced');
  const [thresholdWeight, setThresholdWeight] = useState(54);
  const {
    alignmentState,
    layoutPriority,
    promptSuggestions,
    resonanceScore,
    textDensity,
    trackClick,
    trackSelection,
    trackSlider,
  } = useEvolutionaryState({ scope: role === COMMANDER_ROLE ? 'sovereign' : 'stealth' });

  const handleCategoryChange = (event) => {
    const nextCategory = event.target.value;
    setAssetCategory(nextCategory);
    trackSelection('sovereignAssetCategory', nextCategory, { module: 'asset-grid' });
  };

  const handleThresholdChange = (event) => {
    const nextThreshold = Number(event.target.value);
    setThresholdWeight(nextThreshold);
    trackSlider('sovereignThresholdWeight', nextThreshold, { module: 'timeline-threshold' });
  };

  const handleLayoutFocus = (nextFocus) => {
    setLayoutFocus(nextFocus);
    trackSelection('sovereignView', nextFocus, { module: `${nextFocus}-view` });
    trackClick(`sovereign-view:${nextFocus}`, { module: `${nextFocus}-view` });
  };

  const visibleAssets = useMemo(() => {
    const filtered = assetCategory === 'ALL'
      ? assets
      : assets.filter((asset) => asset.category === assetCategory);

    if (layoutPriority !== 'ASSET_FIRST') return filtered;
    return [...filtered].sort((a, b) => String(a.status).localeCompare(String(b.status)));
  }, [assetCategory, assets, layoutPriority]);

  const visibleMilestones = useMemo(() => {
    const ordered = [...milestones];
    if (thresholdWeight >= 60 || layoutPriority === 'TIMELINE_FIRST') {
      ordered.sort((a, b) => Number(b.isCriticalThreshold) - Number(a.isCriticalThreshold));
    }
    return ordered;
  }, [layoutPriority, milestones, thresholdWeight]);

  if (role !== COMMANDER_ROLE) {
    return (
      <section className="sovereign-dashboard-null" aria-label="Not found">
        <p>Not Found</p>
      </section>
    );
  }

  const assetCount = assets.length;
  const activeAssets = assets.filter((asset) => asset.status === 'ACTIVE').length;
  const criticalMilestones = milestones.filter((milestone) => milestone.isCriticalThreshold).length;
  const layoutClass = getLayoutClass(layoutFocus, layoutPriority);

  return (
    <section className="sovereign-dashboard" aria-label="Sovereign Core Dashboard">
      <div className="sovereign-dashboard__border" />

      <header className="sovereign-dashboard__header">
        <div>
          <p className="sovereign-dashboard__eyebrow">Sovereign Core</p>
          <h1>Asset and Lineage Matrix</h1>
          <p className="sovereign-dashboard__copy">
            Private command surface for geographic assets, estate milestones, and succession thresholds.
            Current session alignment is {alignmentState.toLowerCase()} with adaptive density set to {textDensity.toLowerCase()}.
          </p>
        </div>
        <div className="sovereign-dashboard__status-grid" aria-label="Sovereign dashboard metrics">
          <span><strong>{assetCount}</strong> Asset Nodes</span>
          <span><strong>{activeAssets}</strong> Active</span>
          <span><strong>{criticalMilestones}</strong> Critical</span>
        </div>
      </header>

      <section className="sovereign-dashboard__control-plane" aria-label="Adaptive command controls">
        <div className="sovereign-resonance-readout">
          <span>{alignmentState}</span>
          <strong>{resonanceScore}</strong>
          <small>{promptSuggestions[0]}</small>
        </div>
        <label className="sovereign-control">
          <span>Asset Category</span>
          <select value={assetCategory} onChange={handleCategoryChange}>
            <option value="ALL">All Nodes</option>
            <option value="REAL_ESTATE">Real Estate</option>
            <option value="EQUIPMENT">Equipment</option>
            <option value="BOTANICAL">Botanical</option>
            <option value="LOGISTICS">Logistics</option>
          </select>
        </label>
        <label className="sovereign-control sovereign-control--range">
          <span>Critical Threshold</span>
          <input type="range" min="0" max="100" value={thresholdWeight} onChange={handleThresholdChange} />
        </label>
        <div className="sovereign-view-switch" role="group" aria-label="Dashboard layout priority">
          <button type="button" className={layoutFocus === 'assets' ? 'is-active' : ''} onClick={() => handleLayoutFocus('assets')}>
            Assets
          </button>
          <button type="button" className={layoutFocus === 'balanced' ? 'is-active' : ''} onClick={() => handleLayoutFocus('balanced')}>
            Balanced
          </button>
          <button type="button" className={layoutFocus === 'timeline' ? 'is-active' : ''} onClick={() => handleLayoutFocus('timeline')}>
            Timeline
          </button>
        </div>
      </section>

      <div className={`sovereign-dashboard__layout ${layoutClass}`}>
        <section className="sovereign-panel sovereign-panel--assets" aria-labelledby="asset-node-grid-title">
          <div className="sovereign-panel__title-row">
            <div>
              <p className="sovereign-panel__kicker">Asset Node Grid</p>
              <h2 id="asset-node-grid-title">Geographic Infrastructure</h2>
            </div>
            <span className="sovereign-panel__glyph">◇</span>
          </div>

          <div className="asset-node-grid">
            {visibleAssets.map((asset) => {
              const [longitude, latitude] = asset.location?.coordinates || [];

              return (
                <article className="asset-node-card" key={asset._id || asset.name}>
                  <div className="asset-node-card__topline">
                    <span>{categoryLabels[asset.category] || asset.category}</span>
                    <strong className={`status-chip status-chip--${String(asset.status || '').toLowerCase()}`}>
                      {statusLabels[asset.status] || asset.status}
                    </strong>
                  </div>
                  <h3>{asset.name}</h3>
                  <dl className="asset-node-card__readout">
                    <div>
                      <dt>Latitude</dt>
                      <dd>{formatCoordinate(latitude)}</dd>
                    </div>
                    <div>
                      <dt>Longitude</dt>
                      <dd>{formatCoordinate(longitude)}</dd>
                    </div>
                    <div>
                      <dt>County</dt>
                      <dd>{asset.location?.county || 'Pending'}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{asset.location?.address || 'Pending'}</dd>
                    </div>
                  </dl>
                  {asset.notes && <p className="asset-node-card__notes">{asset.notes}</p>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="sovereign-panel sovereign-panel--timeline" aria-labelledby="chronology-timeline-title">
          <div className="sovereign-panel__title-row">
            <div>
              <p className="sovereign-panel__kicker">Chronology Timeline</p>
              <h2 id="chronology-timeline-title">Lineage Milestones</h2>
            </div>
            <span className="sovereign-panel__glyph">△</span>
          </div>

          <div className="chronology-timeline">
            {visibleMilestones.map((milestone) => (
              <article
                className={`timeline-node${milestone.isCriticalThreshold ? ' timeline-node--critical' : ''}`}
                key={milestone._id || milestone.title}
              >
                <div className="timeline-node__axis" aria-hidden="true" />
                <div className="timeline-node__body">
                  <div className="timeline-node__meta">
                    <span>{formatDate(milestone.targetDate)}</span>
                    <strong>{statusLabels[milestone.status] || milestone.status}</strong>
                  </div>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description || 'No description anchored yet.'}</p>
                  <ul>
                    {(milestone.executionSteps || []).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
};

export default SovereignDashboard;
