import { useState } from 'react';
import { Briefcase, GraduationCap, Users, Layers, Tags, Download, ClipboardList } from 'lucide-react';
import { api, download } from '../../api/client.js';
import { pct, useApi } from '../../utils/useApi.js';
import { DataBadge, Empty, ErrorState, Loading, Notice, StatCard } from '../../components/ui.jsx';
import { DistributionChart } from '../../components/charts.jsx';
import ResearchStatus from '../../components/ResearchStatus.jsx';
import AdminNav from './AdminNav.jsx';

function OriginLine({ counts }) {
  return (
    <span className="row tiny" style={{ gap: 6 }}>
      <span title="Real">{counts.real || 0} real</span>·<span title="Imported">{counts.imported || 0} imported</span>·<span title="Demo">{counts.demo || 0} demo</span>
    </span>
  );
}

function ChartCard({ title, sub, data, showShare = true }) {
  return (
    <div className="card">
      <div className="card-header"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div></div>
      <DistributionChart data={data} showShare={showShare} />
    </div>
  );
}

function Quotes({ items }) {
  if (!items?.length) return <p className="small muted">No free-text answers yet.</p>;
  return items.map((q, i) => <blockquote className="quote" key={i}>{q.text}<div className="tiny muted row" style={{ gap: 6, marginTop: 4 }}>{q.role && <span>{q.role}</span>}<DataBadge origin={q.origin} /></div></blockquote>);
}

function Decision({ status, onSaved }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async (value) => {
    setBusy(true);
    setError(null);
    try { onSaved(await api.setResearchDecision(value, note)); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const decision = status.problemValidation.decision;
  return (
    <div>
      <p className="small muted">“Validated” is a research decision, never automatic. Review the student evidence, then record the outcome.</p>
      {decision && <Notice kind="info" className="mb">Recorded as <strong>{decision.status.replace('_', ' ')}</strong> by {decision.decidedBy} on {new Date(decision.decidedAt).toLocaleDateString()}{decision.note ? ` — “${decision.note}”` : ''}.</Notice>}
      <textarea className="textarea" placeholder="Evidence summary / note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
      <div className="row mt">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => save('validated')}>Mark problem validated</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save('not_validated')}>Mark not validated</button>
        {decision && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(null)}>Clear decision</button>}
      </div>
      {error && <div className="mt"><ErrorState error={error} /></div>}
    </div>
  );
}

export default function AdminDashboard() {
  const { data, error, loading, reload } = useApi(() => api.adminAnalytics(), []);
  const [status, setStatus] = useState(null);

  if (loading) return <Loading label="Loading research data…" />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;

  const { overview: o, students: s, professionals: p } = data;
  const researchStatus = status || data.researchStatus;

  return (
    <div className="container page">
      <div className="page-header">
        <div><div className="eyebrow">Admin / research team</div><h1>Research dashboard</h1><p>Data overview, problem validation and professional insights.</p></div>
      </div>
      <AdminNav />
      {researchStatus.usingDemoData && <Notice kind="demo" className="mb"><strong>Demo data is loaded.</strong> Job-posting and professional analytics include synthetic records until you remove them in Data management. Student validation has no demo data.</Notice>}

      <h2>Data overview</h2>
      <div className="grid grid-4 mb" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <StatCard icon={Briefcase} label="Job postings" value={o.jobs.total} sub={<OriginLine counts={o.jobs} />} />
        <StatCard icon={GraduationCap} label="Student responses" value={o.students.total} sub={`target ${s.target.min}–${s.target.max}`} />
        <StatCard icon={Users} label="Professional responses" value={o.professionals.total} sub={<OriginLine counts={o.professionals} />} />
        <StatCard icon={Layers} label="Roles" value={o.roles} sub={`${o.student_accounts} student accounts`} />
        <StatCard icon={Tags} label="Skills" value={o.skills} sub={`${o.aliases} aliases`} />
      </div>

      <div className="grid grid-2 mb">
        <div className="card"><h3>Research status</h3><ResearchStatus data={researchStatus} /></div>
        <div className="card"><h3>Problem validation decision</h3><Decision status={researchStatus} onSaved={setStatus} /></div>
      </div>

      <div className="row between" style={{ marginTop: 28 }}>
        <h2 style={{ margin: 0 }}><ClipboardList size={20} style={{ verticalAlign: -3 }} /> Student validation</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/admin/student-validation/export.csv', 'skilllens_student_validation.csv')} disabled={!s.count}><Download size={14} /> Export CSV</button>
      </div>
      <p className="small muted">{s.count} response(s) · target {s.target.min}–{s.target.max} students</p>
      <div className="progress mb" style={{ maxWidth: 420 }}><div style={{ width: `${Math.min(100, (s.count / s.target.min) * 100)}%` }} /></div>
      {s.count === 0 ? (
        <div className="card mb"><Empty title="Validation data will be populated through student research.">Share the student survey link: <span className="kbd">{window.location.origin}/research/student-survey</span></Empty></div>
      ) : (
        <>
          <div className="grid grid-3 mb">
            <StatCard label="Would use SkillLens" value={pct(s.headline.willingToUse)} sub={`Definitely + Probably · n=${s.headline.willingToUseN}`} />
            <StatCard label="Learned a skill that wasn’t useful" value={pct(s.headline.learnedNotUseful)} sub={`answered Yes · n=${s.headline.learnedNotUsefulN}`} />
            <StatCard label="Get conflicting advice" value={pct(s.headline.conflictingAdvice)} sub={`Often + Sometimes · n=${s.headline.conflictingAdviceN}`} />
          </div>
          {s.count < s.target.min && <Notice kind="warn" className="mb">Only {s.count} response(s) so far — too few to draw conclusions. Percentages are shown for monitoring, not as findings.</Notice>}
          <div className="grid grid-2 mb">
            <ChartCard title="Most confusing part of preparing" sub="Pain points" data={s.confusingPart} />
            <ChartCard title="How students decide what to learn" sub="Share of respondents (multi-select)" data={s.decideMethods} />
            <ChartCard title="Most trusted sources" sub="Share of respondents (up to 3 each)" data={s.trustedSources} />
            <ChartCard title="Would use a platform like SkillLens" data={s.wouldUsePlatform} />
            <ChartCard title="Would a skill-gap view help?" data={s.gapViewHelpful} />
            <ChartCard title="Number of sources used" data={s.sourceCount} />
            <ChartCard title="Conflicting advice from sources" data={s.conflictingAdvice} />
            <ChartCard title="Learned a skill that turned out not useful" data={s.learnedNotUseful} />
          </div>
          <div className="grid grid-2 mb">
            <div className="card"><h3>Pain points in students’ words</h3><Quotes items={s.painPointQuotes} /></div>
            <div className="card"><h3>Other comments</h3><Quotes items={s.comments} /></div>
          </div>
        </>
      )}

      <div className="row between" style={{ marginTop: 28 }}>
        <h2 style={{ margin: 0 }}><Users size={20} style={{ verticalAlign: -3 }} /> Professional insights</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/admin/professional-responses/export.csv', 'skilllens_professional_responses.csv')} disabled={!p.count}><Download size={14} /> Export CSV</button>
      </div>
      <p className="small muted">{p.count} response(s) · {p.origins.real || 0} real, {p.origins.imported || 0} imported, {p.origins.demo || 0} demo · target {p.target.min}–{p.target.max} professionals</p>
      {p.count === 0 ? <div className="card"><Empty title="No professional responses yet" /></div> : (
        <>
          <div className="grid grid-2 mb">
            <ChartCard title="Frequently reported skills" sub="Share of professionals who use it regularly" data={p.frequentSkills.map((x) => ({ label: x.name, count: x.count, share: x.share }))} />
            <ChartCard title="Frequently reported tools" sub="Share of professionals" data={p.frequentTools.map((x) => ({ label: x.name, count: x.count, share: x.share }))} />
            <ChartCard title="Professional priorities for beginners" sub="Times named important for beginners" showShare={false} data={p.beginnerPriorities.map((x) => ({ label: x.name, count: x.count, share: x.share }))} />
            <ChartCard title="Skills flagged as overemphasized" sub="Times named" showShare={false} data={p.overemphasized.map((x) => ({ label: x.name, count: x.count, share: x.share }))} />
          </div>
          <div className="grid grid-3 mb">
            <div className="card"><h3>Common beginner mistakes</h3><Quotes items={p.beginnerMistakes.slice(0, 6)} /></div>
            <div className="card"><h3>Wish they had learned earlier</h3><Quotes items={p.wishLearnedEarlier.slice(0, 6)} /></div>
            <div className="card">
              <h3>Role-level differences</h3>
              <p className="small muted">Top skills used, per role</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Role</th><th className="num">n</th><th>Top skills used</th></tr></thead>
                  <tbody>{p.roleDifferences.map((r) => (
                    <tr key={r.role}><td className="small"><strong>{r.role}</strong></td><td className="num">{r.responses}</td><td className="small">{r.topSkills.map((x) => x.name).join(', ')}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="grid grid-3">
            <ChartCard title="Experience" showShare={false} data={p.experienceBands} />
            <ChartCard title="Willing to contribute again" showShare={false} data={p.willingToContribute} />
            <ChartCard title="Motivation" showShare={false} data={p.motivation} />
          </div>
        </>
      )}
    </div>
  );
}
