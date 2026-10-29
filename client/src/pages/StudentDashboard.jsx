import { Link } from 'react-router-dom';
import { Target, Pencil, Wrench, Quote, ArrowRight } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LEVELS, pct, useApi } from '../utils/useApi.js';
import { DataBadge, DataBasisNote, Empty, ErrorState, Loading, ProgressRing, ScoreBars } from '../components/ui.jsx';
import { GapChart, IndustryVsYouRadar } from '../components/charts.jsx';
import { LearningOrder, radarData } from '../components/GapViews.jsx';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.dashboard(), []);

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;

  if (!data.gap) {
    return (
      <div className="container page">
        <div className="card" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: 40 }}>
          <div className="icon-circle" style={{ margin: '0 auto 12px' }}><Target size={18} /></div>
          <h2>Welcome, {user.name.split(' ')[0]}</h2>
          <p className="muted">Pick a career goal and add your skills to build your dashboard.</p>
          <Link to="/assess" className="btn btn-primary">Start my assessment <ArrowRight size={16} /></Link>
        </div>
      </div>
    );
  }

  const { gap, roleAnalysis, skills, history } = data;
  const dataBasis = { ...roleAnalysis.dataBasis };
  const topSkills = roleAnalysis.topSkills.filter((s) => s.score > 0).slice(0, 8);
  const previous = history.length > 1 ? history[history.length - 2].readiness : null;

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Student dashboard</div>
          <h1>Hi {user.name.split(' ')[0]}, here is where you stand</h1>
          <DataBasisNote dataBasis={dataBasis} />
        </div>
        <div className="row">
          <Link to="/assess" className="btn btn-secondary"><Pencil size={15} /> Update skills</Link>
          <Link to={`/gap?role=${gap.role.slug}`} className="btn btn-primary">Full gap analysis</Link>
        </div>
      </div>

      <div className="grid grid-3 mb">
        <div className="card">
          <div className="stat-label"><Target size={15} /> Career goal</div>
          <h2 style={{ margin: '6px 0 4px' }}>{gap.role.name}</h2>
          <p className="small muted">{gap.counts.required} required skills · {gap.counts.gaps} to work on</p>
          <Link to={`/roles/${gap.role.slug}`} className="small">Explore this role →</Link>
          <span className="small muted"> · </span>
          <Link to="/assess" className="small">Change goal</Link>
        </div>
        <div className="card row" style={{ gap: 16, flexWrap: 'nowrap' }}>
          <ProgressRing value={gap.readiness} />
          <div>
            <h3>Skill readiness</h3>
            <p className="small muted" style={{ margin: 0 }}>Score-weighted share of the expected proficiency you already have.</p>
            {previous !== null && <p className="small" style={{ marginTop: 6 }}>{gap.readiness - previous >= 0 ? '▲' : '▼'} {Math.abs(Math.round(gap.readiness - previous))} pts since last check</p>}
          </div>
        </div>
        <div className="card">
          <h3>Recommended priorities</h3>
          <LearningOrder steps={gap.learningOrder} limit={4} />
        </div>
      </div>

      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-header"><div><h3>Top industry skills</h3><p>{gap.role.name} · SkillLens score</p></div></div>
          <ScoreBars items={topSkills.map((s) => ({ label: s.name, value: s.score, title: `${s.name}: score ${s.score}${s.industryDemand !== null ? `, in ${pct(s.industryDemand)} of postings` : ''}` }))} />
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Your skills</h3><p>{skills.length} in your profile</p></div><Link to="/assess" className="small">Edit</Link></div>
          {skills.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {skills.slice(0, 12).map((s) => (
                <div key={s.name} className="row between small">
                  <span><strong style={{ fontWeight: 600 }}>{s.name}</strong> <span className="tiny muted">{s.category}</span></span>
                  <span className="row" style={{ gap: 3 }} aria-label={LEVELS[s.level]}>
                    {[1, 2, 3].map((l) => <span key={l} style={{ width: 18, height: 6, borderRadius: 3, background: l <= s.level ? 'var(--series-you)' : 'var(--surface-2)' }} />)}
                    <span className="tiny muted" style={{ width: 80, textAlign: 'right' }}>{LEVELS[s.level]}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty title="No skills added yet" />}
        </div>
      </div>

      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-header"><div><h3>Industry vs you</h3><p>Expected vs your level on the top required skills</p></div></div>
          <IndustryVsYouRadar data={radarData(gap.rows)} height={300} />
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Biggest skill gaps</h3><p>Levels to close per skill</p></div></div>
          {gap.biggestGaps.length ? <GapChart data={gap.biggestGaps.slice(0, 8).map((g) => ({ name: g.name, gap: g.gap }))} /> : <Empty title="No gaps for the required skills" />}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card span-2">
          <div className="card-header"><div><h3><Wrench size={16} style={{ verticalAlign: -2 }} /> Tools professionals use</h3><p>Tools, platforms and libraries for {gap.role.name}</p></div></div>
          {roleAnalysis.tools.length ? (
            <div className="grid grid-4">
              {roleAnalysis.tools.slice(0, 8).map((t) => (
                <div key={t.name} className="card flat" style={{ padding: 14 }}>
                  <strong>{t.name}</strong>
                  <div className="tiny muted">{t.professionalUsage !== null ? `${pct(t.professionalUsage)} of pros use it` : t.industryDemand !== null ? `${pct(t.industryDemand)} of postings` : t.category}</div>
                </div>
              ))}
            </div>
          ) : <Empty title="No tools recorded yet" />}
        </div>
        <div className="card">
          <div className="card-header"><div><h3><Quote size={16} style={{ verticalAlign: -2 }} /> From professionals</h3><p>{roleAnalysis.professionalInsights.count} response(s)</p></div></div>
          {roleAnalysis.professionalInsights.beginnerMistakes.length ? roleAnalysis.professionalInsights.beginnerMistakes.map((q, i) => (
            <blockquote className="quote" key={i}>{q.text} <DataBadge origin={q.origin} /></blockquote>
          )) : <p className="small muted">Beginner tips will appear once professionals complete the survey.</p>}
        </div>
      </div>
    </div>
  );
}
