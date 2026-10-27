import { CircleDashed, CircleDot, CircleCheck, CircleX } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';

const STYLE = {
  Pending: { icon: CircleDashed, color: 'var(--text-3)' },
  'In Progress': { icon: CircleDot, color: 'var(--warn)' },
  Imported: { icon: CircleCheck, color: 'var(--good)' },
  Available: { icon: CircleCheck, color: 'var(--good)' },
  Validated: { icon: CircleCheck, color: 'var(--good)' },
  'Not validated': { icon: CircleX, color: 'var(--bad)' },
};

function Item({ label, status, detail }) {
  const s = STYLE[status] || STYLE.Pending;
  const Icon = s.icon;
  return (
    <div className="row between" style={{ padding: '4px 0' }}>
      <span className="small">{label}</span>
      <span className="row small" style={{ gap: 6, color: s.color, fontWeight: 600 }} title={detail}>
        <Icon size={15} /> {status}
        {detail && <span className="muted" style={{ fontWeight: 400 }}>· {detail}</span>}
      </span>
    </div>
  );
}

/** "Research Status": honest progress of problem validation and data collection. */
export default function ResearchStatus({ compact = false, data: provided }) {
  const { data: fetched } = useApi(() => (provided ? Promise.resolve(provided) : api.researchStatus()), [provided]);
  const data = provided || fetched;
  if (!data) return <div className="small muted">Loading status…</div>;
  const p = data.problemValidation;
  const pro = data.professionalData;
  const job = data.jobMarketData;
  return (
    <div>
      <Item label="Problem validation" status={p.status} detail={`${p.responses}/${p.target} students`} />
      <Item label="Professional data" status={pro.status} detail={`${pro.responses}/${pro.target} professionals`} />
      <Item label="Job market data" status={job.status} detail={job.postings ? `${job.postings} postings` : 'demo only'} />
      {!compact && data.usingDemoData && (
        <p className="tiny muted mt">Demo records are excluded from these counts. They exist only so the prototype works before data collection.</p>
      )}
    </div>
  );
}
