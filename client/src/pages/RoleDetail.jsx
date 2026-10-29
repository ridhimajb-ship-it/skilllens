import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Briefcase, Users, AlertTriangle, Lightbulb, CheckCircle2, HelpCircle, Sparkles, MinusCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { pct, useApi } from '../utils/useApi.js';
import { DataBadge, DataBasisNote, Empty, ErrorState, Loading, ScoreBars, StatCard, Tier } from '../components/ui.jsx';
import { IndustryVsProfessionalChart, SkillRankingChart } from '../components/charts.jsx';

function Quotes({ items, empty }) {
  if (!items?.length) return <p className="small muted">{empty}</p>;
  return items.map((q, i) => (
    <blockquote className="quote" key={i}>
      {q.text}
      <div className="tiny muted row" style={{ marginTop: 4, gap: 6 }}>
        {q.experience && <span>{q.experience}</span>}
        <DataBadge origin={q.origin} />
      </div>
    </blockquote>
  ));
}

export default function RoleDetail() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useApi(() => api.roleAnalysis(slug), [slug]);
  const [showAll, setShowAll] = useState(false);

  if (loading) return <Loading />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;

  const { role, dataBasis, skills, tools, categories, hypothesisCheck, professionalInsights: pi, postingFacts } = data;
  const isData = dataBasis.basis === 'data';
  const ranked = skills.filter((s) => s.score > 0);
  const top = ranked.slice(0, 15);
  const comparison = ranked.filter((s) => s.industryDemand !== null && s.professionalUsage !== null).slice(0, 12)
    .map((s) => ({ name: s.name, industry: Math.round(s.industryDemand * 100), professional: Math.round(s.professionalUsage * 100) }));
  const tableRows = showAll ? skills : skills.slice(0, 20);

  return (
    <div className="container page">
      <Link to="/roles" className="small row" style={{ gap: 4, marginBottom: 12 }}><ArrowLeft size={14} /> All roles</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">{role.category}</div>
          <h1>{role.name}</h1>
          <p>{role.description}</p>
          <div className="mt"><DataBasisNote dataBasis={dataBasis} /></div>
        </div>
        <Link to={`/assess?role=${role.slug}`} className="btn btn-primary btn-lg">Compare My Skills <ArrowRight size={18} /></Link>
      </div>

      <div className="grid grid-4 mb">
        <StatCard icon={Briefcase} label="Job postings analysed" value={dataBasis.postingTotal} sub={dataBasis.origins.postings.demo ? `${dataBasis.origins.postings.demo} demo` : 'no demo records'} />
        <StatCard icon={Users} label="Professional responses" value={dataBasis.professionalTotal} sub={pi.demoCount ? `${pi.demoCount} demo` : 'no demo records'} />
        <StatCard label="Entry-level postings" value={postingFacts.total ? pct(postingFacts.entry_level / postingFacts.total) : '—'} sub="asking for ≤ 1 year experience" />
        <StatCard label="Median experience asked" value={postingFacts.median_experience !== null && postingFacts.median_experience !== undefined ? `${postingFacts.median_experience} yrs` : '—'} sub={`${postingFacts.with_experience} postings state it`} />
      </div>

      <div className="grid grid-3 mb">
        <div className="card span-2">
          <div className="card-header">
            <div><h3>Most important skills</h3><p>{isData ? 'SkillLens score (0–100) from job-posting demand and professional usage' : 'Initial hypothesis — core skills shown first'}</p></div>
            <Link to="/research#algorithm" className="small">How scores work</Link>
          </div>
          {isData ? <SkillRankingChart data={top.map((s) => ({ name: s.name, score: s.score }))} /> : (
            <div className="chips">{skills.map((s) => <span key={s.name} className={`chip ${s.hypothesisTier === 'core' ? 'chip-blue' : ''}`}>{s.name}</span>)}</div>
          )}
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Tools used</h3><p>Tools, platforms and libraries</p></div></div>
          {tools.length ? (
            <ScoreBars items={tools.map((t) => ({ label: t.name, value: t.score, title: t.industryDemand !== null ? `${t.name}: in ${pct(t.industryDemand)} of postings` : t.name }))} limit={10} />
          ) : <Empty title="No tools recorded yet" />}
        </div>
      </div>

      <div className="card mb">
        <div className="card-header">
          <div><h3>Skill analysis</h3><p>Every score with the evidence behind it</p></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Skill</th><th>Category</th><th className="num">Score</th><th>Tier</th>
                <th className="num" title="Share of this role's postings that mention the skill">In postings</th>
                <th className="num" title="Share of professionals in this role who use it regularly">Pros use it</th>
                <th className="num" title="Share of professionals naming it important for beginners">Beginner pick</th>
                <th className="num" title="How concentrated the skill is in this role vs other roles (0.5 = equally common elsewhere)">Specificity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((s) => (
                <tr key={s.skillId}>
                  <td className="muted">{s.rank}</td>
                  <td><strong>{s.name}</strong></td>
                  <td className="muted small">{s.category}</td>
                  <td className="num">{isData ? s.score : '—'}</td>
                  <td><Tier tier={s.tier} /></td>
                  <td className="num">{pct(s.industryDemand)}</td>
                  <td className="num">{pct(s.professionalUsage)}</td>
                  <td className="num">{pct(s.beginnerImportance)}</td>
                  <td className="num">{s.specificity ?? '—'}</td>
                  <td>{s.inHypothesis ? <span className="badge badge-neutral">Hypothesis{s.hypothesisTier ? ` · ${s.hypothesisTier}` : ''}</span> : <span className="badge badge-imported">Found in data</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {skills.length > 20 && <button type="button" className="btn btn-ghost btn-sm mt" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${skills.length} skills`}</button>}
      </div>

      {isData && hypothesisCheck && (
        <div className="card mb">
          <div className="card-header"><div><h3>Hypothesis check</h3><p>How the team&apos;s initial skill list compares with the analysed data</p></div></div>
          <div className="grid grid-4">
            {[
              { icon: CheckCircle2, title: 'Supported (score ≥ 40)', items: hypothesisCheck.supported, color: 'var(--good)' },
              { icon: HelpCircle, title: 'Weak evidence (< 40)', items: hypothesisCheck.weak, color: 'var(--warn)' },
              { icon: MinusCircle, title: 'Not observed', items: hypothesisCheck.notObserved, color: 'var(--text-3)' },
              { icon: Sparkles, title: 'Found in data, not in hypothesis', items: hypothesisCheck.discovered, color: 'var(--primary)' },
            ].map(({ icon: Icon, title, items, color }) => (
              <div key={title}>
                <div className="row small" style={{ gap: 6, fontWeight: 600, color, marginBottom: 8 }}><Icon size={15} /> {title} ({items.length})</div>
                <div className="chips">{items.length ? items.map((n) => <span className="chip" key={n}>{n}</span>) : <span className="tiny muted">None</span>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-header"><div><h3>Industry demand vs professional usage</h3><p>Do postings ask for what professionals actually use?</p></div></div>
          {comparison.length ? <IndustryVsProfessionalChart data={comparison} /> : <Empty title="Needs both job postings and professional responses for this role" />}
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Skill categories</h3><p>Average score of skills in each category</p></div></div>
          <div className="stack" style={{ gap: 12 }}>
            {categories.slice(0, 8).map((c) => (
              <div key={c.category}>
                <div className="row between small"><strong>{c.category}</strong><span className="muted">{isData ? `avg ${c.averageScore}` : `${c.count} skills`}</span></div>
                <div className="chips" style={{ marginTop: 4 }}>{c.skills.slice(0, 8).map((s) => <span className="chip" key={s.name}>{s.name}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-3 mb">
        <div className="card">
          <div className="card-header"><div><h3><Users size={16} style={{ verticalAlign: -2 }} /> Professional insights</h3><p>{pi.count} response(s)</p></div></div>
          {pi.count === 0 ? <Empty title="No professional responses yet">Professional insights will appear once working professionals complete the survey.</Empty> : (
            <>
              <div className="label small">Most used</div>
              <div className="chips mb" style={{ marginTop: 6 }}>{pi.topUsed.slice(0, 8).map((s) => <span className="chip chip-blue" key={s.name}>{s.name} · {s.count}</span>)}</div>
              <div className="label small">Most important for beginners</div>
              <div className="chips mb" style={{ marginTop: 6 }}>{pi.beginnerSkills.slice(0, 6).map((s) => <span className="chip" key={s.name}>{s.name} · {s.count}</span>)}</div>
              <div className="label small">Flagged as overemphasized</div>
              <div className="chips" style={{ marginTop: 6 }}>{pi.overemphasized.length ? pi.overemphasized.slice(0, 6).map((s) => <span className="chip" key={s.name}>{s.name} · {s.count}</span>) : <span className="tiny muted">None reported</span>}</div>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-header"><div><h3><AlertTriangle size={16} style={{ verticalAlign: -2 }} /> Beginner challenges</h3><p>Common mistakes reported by professionals</p></div></div>
          <Quotes items={pi.beginnerMistakes} empty="Will be populated from the professional survey." />
        </div>
        <div className="card">
          <div className="card-header"><div><h3><Lightbulb size={16} style={{ verticalAlign: -2 }} /> What they wish they learned earlier</h3></div></div>
          <Quotes items={pi.wishLearnedEarlier} empty="Will be populated from the professional survey." />
          {pi.workReality?.length > 0 && <><hr className="divider" /><div className="label small mb">What the work actually looks like</div><Quotes items={pi.workReality.slice(0, 2)} /></>}
        </div>
      </div>

      <div className="card" style={{ background: 'var(--primary-50)', borderColor: 'var(--primary-100)' }}>
        <div className="row between">
          <div>
            <h3 style={{ color: 'var(--primary-ink)' }}>Assess yourself</h3>
            <p className="small" style={{ margin: 0, color: 'var(--primary-ink)' }}>Rate your current skills to see your gaps for {role.name} and a suggested learning order.</p>
          </div>
          <Link to={`/assess?role=${role.slug}`} className="btn btn-primary">Compare My Skills <ArrowRight size={16} /></Link>
        </div>
      </div>
    </div>
  );
}
