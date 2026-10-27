import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wrench, Layers } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';
import { DataBadge, ErrorState, Loading, Notice } from '../components/ui.jsx';

const CONF_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', none: 'No data yet' };

export function RoleCard({ role }) {
  return (
    <Link to={`/roles/${role.slug}`} className="card hover" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="role-card">
      <div className="row between">
        <span className="tiny muted">{role.category}</span>
        {role.basis === 'hypothesis' ? <DataBadge origin="hypothesis" /> : role.demoPostingCount === role.postingCount && role.postingCount > 0 ? <DataBadge origin="demo" /> : null}
      </div>
      <div>
        <h3 style={{ marginBottom: 4 }}>{role.name}</h3>
        <p className="small muted" style={{ margin: 0 }}>{role.description}</p>
      </div>
      <div>
        <div className="tiny muted row" style={{ gap: 4, marginBottom: 4 }}><Layers size={12} /> Top skills</div>
        <div className="chips">{role.topSkills.map((s) => <span className="chip chip-blue" key={s}>{s}</span>)}</div>
      </div>
      {role.topTools.length > 0 && (
        <div>
          <div className="tiny muted row" style={{ gap: 4, marginBottom: 4 }}><Wrench size={12} /> Top tools</div>
          <div className="chips">{role.topTools.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
        </div>
      )}
      <div style={{ marginTop: 'auto' }}>
        <div className="row between tiny muted" style={{ marginBottom: 4 }}>
          <span>{role.skillCount} skills · {role.postingCount} postings analysed</span>
          <span>{CONF_LABEL[role.confidence]}</span>
        </div>
        <div className="progress" title="Share of postings in the current dataset, relative to the role with the most postings. Not a measure of market demand.">
          <div style={{ width: `${Math.round(role.datasetShare * 100)}%` }} />
        </div>
      </div>
    </Link>
  );
}

export default function RoleExplorer() {
  const { data, error, loading, reload } = useApi(() => api.roles(), []);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => ['All', ...new Set((data?.roles || []).map((r) => r.category))], [data]);
  const roles = (data?.roles || []).filter((r) => (category === 'All' || r.category === category)
    && (!q || `${r.name} ${r.topSkills.join(' ')} ${r.topTools.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const anyDemo = (data?.roles || []).some((r) => r.demoPostingCount > 0);

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Role Explorer</div>
          <h1>Career roles</h1>
          <p>Pick a role to see which skills appear most in job postings and in professionals&apos; day-to-day work.</p>
        </div>
      </div>
      {anyDemo && <Notice kind="demo" className="mb"><strong>Demo data — replace with validated research data.</strong> Skill lists below are ranked from synthetic demo postings until real data is imported.</Notice>}
      <div className="row mb" style={{ gap: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search roles, skills or tools" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roles" />
        </div>
        <div className="chips">
          {categories.map((c) => (
            <button key={c} type="button" className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-3">{roles.map((r) => <RoleCard key={r.slug} role={r} />)}</div>
          {roles.length === 0 && <div className="empty">No roles match your search.</div>}
          <p className="tiny muted mt">The bar under each card shows the role&apos;s share of the analysed dataset — it reflects what has been collected, not overall market demand.</p>
        </>
      )}
    </div>
  );
}
