import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trophy, TrendingUp, Flag } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../utils/useApi.js';
import { DataBasisNote, Empty, ErrorState, Loading, Notice, Priority, ProgressRing } from '../components/ui.jsx';
import { GapChart, IndustryVsYouRadar } from '../components/charts.jsx';
import { GapTable, LearningOrder, MethodNote, radarData } from '../components/GapViews.jsx';
import { GUEST_KEY } from './Assessment.jsx';

function loadGuest(role) {
  try {
    const g = JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null');
    return g && (!role || g.role === role) ? g.result : null;
  } catch { return null; }
}

export function GapReport({ result, compact = false }) {
  return (
    <div className="stack">
      <div className="grid grid-3">
        <div className="card row" style={{ gap: 18, flexWrap: 'nowrap' }}>
          <ProgressRing value={result.readiness} />
          <div>
            <h3>Skill readiness</h3>
            <p className="small muted" style={{ margin: 0 }}>{result.counts.met} of {result.counts.required} required skills at the expected level; {result.counts.partial} partly there.</p>
          </div>
        </div>
        <div className="card">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}><Trophy size={16} color="var(--good)" /><h3 style={{ margin: 0 }}>Strongest skills</h3></div>
          {result.strengths.length ? <div className="chips">{result.strengths.slice(0, 8).map((s) => <span className="chip chip-blue" key={s.name}>{s.name}</span>)}</div>
            : <p className="small muted">None of the required skills meet the expected level yet — that is normal at the start.</p>}
        </div>
        <div className="card">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}><Flag size={16} color="var(--series-you)" /><h3 style={{ margin: 0 }}>High-priority skills</h3></div>
          {result.highPriority.length ? <div className="stack" style={{ gap: 6 }}>{result.highPriority.slice(0, 5).map((s) => (
            <div className="row between small" key={s.name}><span>{s.name}</span><Priority value={s.priority} /></div>
          ))}</div> : <p className="small muted">No high-priority gaps.</p>}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><div><h3>Industry vs you</h3><p>Expected level vs your level (0 = not yet, 3 = advanced)</p></div></div>
          <IndustryVsYouRadar data={radarData(result.rows)} />
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Biggest skill gaps</h3><p>Levels between you and the expected level</p></div></div>
          {result.biggestGaps.length ? <GapChart data={result.biggestGaps.slice(0, 10).map((g) => ({ name: g.name, gap: g.gap }))} /> : <Empty title="No gaps — nice work" icon={Trophy} />}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-header"><div><h3><TrendingUp size={16} style={{ verticalAlign: -2 }} /> Suggested learning order</h3><p>Priority first, prerequisites before what depends on them</p></div></div>
          <LearningOrder steps={result.learningOrder} limit={compact ? 6 : undefined} />
        </div>
        <div className="card span-2">
          <div className="card-header"><div><h3>Skill gap analysis</h3><p>{result.role.name} · top required skills</p></div></div>
          <GapTable rows={result.rows} />
          {result.otherSkills?.length > 0 && (
            <div className="mt small"><span className="muted">Also in your profile (not among this role&apos;s top skills): </span>{result.otherSkills.map((s) => s.name).join(', ')}</div>
          )}
          <div className="mt"><MethodNote method={result.method} basis={result.basis} /></div>
        </div>
      </div>
    </div>
  );
}

export default function GapAnalysis() {
  const { user, ready } = useAuth();
  const [params] = useSearchParams();
  const role = params.get('role');
  const isStudent = user?.role === 'student';
  const { data, error, loading, reload } = useApi(
    () => (!ready ? new Promise(() => {}) : isStudent ? api.skillGap(role) : Promise.resolve(loadGuest(role))),
    [ready, isStudent, role],
  );

  if (loading) return <Loading label="Calculating your skill gap…" />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) {
    return (
      <div className="container page">
        <div className="card"><Empty title="No assessment yet">Start by selecting a role and rating your skills. <div className="mt"><Link to="/assess" className="btn btn-primary">Assess my skills</Link></div></Empty></div>
      </div>
    );
  }

  return (
    <div className="container page">
      <Link to="/assess" className="small row" style={{ gap: 4, marginBottom: 12 }}><ArrowLeft size={14} /> Back to assessment</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">Skill gap analysis</div>
          <h1>{data.role.name}</h1>
          <DataBasisNote dataBasis={{ ...data.dataBasis, basis: data.basis }} />
        </div>
        <div className="row">
          <Link to={`/assess?role=${data.role.slug}`} className="btn btn-secondary"><Pencil size={15} /> Edit skills</Link>
          <Link to={`/roles/${data.role.slug}`} className="btn btn-secondary">View role details</Link>
          {isStudent && <Link to="/dashboard" className="btn btn-primary">Go to dashboard</Link>}
        </div>
      </div>
      {!isStudent && <Notice kind="info" className="mb">Guest result — not saved. <Link to="/register">Create an account</Link> to keep it and track your readiness over time.</Notice>}
      <GapReport result={data} />
    </div>
  );
}
