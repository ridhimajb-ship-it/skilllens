import { Priority, Tier } from './ui.jsx';

export function GapTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table" aria-label="Skill gap table">
        <thead>
          <tr><th>Required skill</th><th>Industry score</th><th>Expected</th><th>Your level</th><th>Gap</th><th>Priority</th><th>Why</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skillId}>
              <td><strong>{r.name}</strong><div className="tiny muted">{r.category}</div></td>
              <td><span className="row" style={{ gap: 6 }}><span className="num" style={{ minWidth: 30 }}>{Math.round(r.industryScore)}</span><Tier tier={r.industryTier} /></span></td>
              <td>{r.requiredLabel}</td>
              <td className={r.studentLevel === 0 ? 'muted' : ''}>{r.studentLabel}</td>
              <td>{r.gapLabel}</td>
              <td><Priority value={r.priority} /></td>
              <td className="small muted" style={{ maxWidth: 320 }}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LearningOrder({ steps, limit }) {
  const list = limit ? steps.slice(0, limit) : steps;
  if (!list.length) return <p className="small muted">No gaps found for the required skills — you meet the expected level for all of them.</p>;
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Suggested learning order">
      {list.map((s) => (
        <li key={s.skillId} className="row" style={{ gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap' }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{s.step}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{s.name}</strong>
            <div className="tiny muted">{s.from} → {s.to}{s.note ? ` · ${s.note}` : ''}</div>
          </div>
          <Priority value={s.priority} />
        </li>
      ))}
    </ol>
  );
}

/** Radar data: expected vs current level for the top required skills. */
export function radarData(rows, limit = 8) {
  return rows.slice(0, limit).map((r) => ({ name: r.name, required: r.requiredLevel, you: r.studentLevel }));
}

export function MethodNote({ method, basis }) {
  return (
    <details className="small muted">
      <summary style={{ cursor: 'pointer' }}>How this was calculated</summary>
      <ul style={{ marginTop: 8 }}>
        <li><strong>Required skills:</strong> {method.requiredSkills}{basis === 'hypothesis' ? ' (hypothesis weights: core = 70, secondary = 40, because no data exists for this role yet)' : ''}.</li>
        <li><strong>Expected level:</strong> {method.requiredLevel}. This is a stated assumption, not a measurement.</li>
        <li><strong>Priority:</strong> {method.priority} — high-scoring skills with big gaps come first.</li>
        <li><strong>Readiness:</strong> {method.readiness}.</li>
        <li><strong>Learning order:</strong> by priority, with unmet prerequisites (e.g. Python before Machine Learning) moved earlier.</li>
      </ul>
      <p>This is a transparent rule-based estimate to help you prioritise — not a prediction of hiring outcomes.</p>
    </details>
  );
}
