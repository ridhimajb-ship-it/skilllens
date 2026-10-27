import { AlertTriangle, FlaskConical, Info, Inbox, CheckCircle2, XCircle } from 'lucide-react';
import { slugClass } from '../utils/useApi.js';

export function Loading({ label = 'Loading…' }) {
  return <div className="loading" role="status"><div className="spinner" /> {label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="notice notice-error" role="alert">
      <XCircle size={18} />
      <div>
        <strong>Something went wrong.</strong> {error?.message || String(error)}
        {onRetry && <div className="mt"><button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button></div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon size={36} />
      <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
      {children && <div className="small mt">{children}</div>}
    </div>
  );
}

const NOTICE_ICONS = { demo: FlaskConical, info: Info, warn: AlertTriangle, error: XCircle, success: CheckCircle2 };
export function Notice({ kind = 'info', children, className = '' }) {
  const Icon = NOTICE_ICONS[kind];
  return <div className={`notice notice-${kind} ${className}`}><Icon size={18} /><div>{children}</div></div>;
}

/** Provenance label: every number in SkillLens is tagged with where it came from. */
const ORIGIN = {
  demo: ['badge-demo', 'Demo data'],
  real: ['badge-real', 'Real data'],
  imported: ['badge-imported', 'Imported data'],
  hypothesis: ['badge-hypothesis', 'Hypothesis'],
  illustrative: ['badge-illustrative', 'Illustrative'],
};
export function DataBadge({ origin, label }) {
  const [cls, text] = ORIGIN[origin] || ['badge-neutral', origin];
  return <span className={`badge ${cls}`} title={`Data origin: ${text}`}>{label || text}</span>;
}

export function DemoBanner({ dataBasis, compact = false }) {
  if (!dataBasis) return null;
  if (dataBasis.basis === 'hypothesis') {
    return (
      <Notice kind="warn">
        <strong>Initial hypothesis — not yet validated.</strong> No job-posting or professional data has been analysed for this role yet,
        so skills are shown from the team&apos;s starting taxonomy without scores.
      </Notice>
    );
  }
  if (!dataBasis.containsDemo && !dataBasis.runIncludesDemo) return null;
  return (
    <Notice kind="demo">
      <strong>Demo data — replace with validated research data.</strong>
      {!compact && ' These rankings are computed from synthetic postings and responses generated from the initial hypothesis. They demonstrate the method; they are not market findings.'}
    </Notice>
  );
}

const CONF = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };
export function DataBasisNote({ dataBasis }) {
  if (!dataBasis) return null;
  return (
    <div className="row small muted" style={{ gap: 14 }}>
      <span>Based on <strong>{dataBasis.postingTotal}</strong> job postings</span>
      <span><strong>{dataBasis.professionalTotal}</strong> professional responses</span>
      <span>Confidence: <strong>{CONF[dataBasis.confidence] || '—'}</strong></span>
      {dataBasis.containsDemo || dataBasis.runIncludesDemo ? <DataBadge origin="demo" /> : dataBasis.basis === 'hypothesis' ? <DataBadge origin="hypothesis" /> : null}
    </div>
  );
}

export function Tier({ tier }) {
  if (!tier) return null;
  if (tier.startsWith('Hypothesis')) return <span className="badge badge-hypothesis">{tier.replace('Hypothesis: ', '')}</span>;
  return <span className={`tier tier-${slugClass(tier)}`}>{tier}</span>;
}

export function Priority({ value }) {
  return <span className={`prio prio-${slugClass(value)}`}>{value}</span>;
}

export function StatCard({ label, value, sub, icon: Icon, badge }) {
  return (
    <div className="card stat">
      <div className="row between">
        <span className="stat-label">{Icon && <Icon size={15} />}{label}</span>
        {badge}
      </div>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

/** Horizontal score bars (0-100). Accessible: the value is always printed as text. */
export function ScoreBars({ items, max = 100, variant = '', valueFormat = (v) => Math.round(v), limit }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div role="list">
      {list.map((it) => (
        <div className="bar-row" key={it.label} role="listitem" title={it.title || `${it.label}: ${valueFormat(it.value)}`}>
          <span className="bar-label">{it.label}</span>
          <div className="bar-track"><div className={`bar-fill ${variant}`} style={{ width: `${Math.max(0, Math.min(100, (it.value / max) * 100))}%` }} /></div>
          <span className="bar-value">{valueFormat(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressRing({ value, label = 'ready', size = 132 }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="ring" style={{ width: size, height: size }} aria-label={`${v}% ${label}`}>
      <svg viewBox="0 0 132 132" width={size} height={size}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--primary-600)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 66 66)" style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      <div className="ring-value"><div><strong>{v}%</strong><span className="tiny muted">{label}</span></div></div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
