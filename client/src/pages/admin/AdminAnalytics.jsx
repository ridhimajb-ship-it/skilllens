import { useMemo, useState } from 'react';
import { RefreshCw, PlayCircle } from 'lucide-react';
import { api } from '../../api/client.js';
import { pct, useApi } from '../../utils/useApi.js';
import { DataBasisNote, Empty, ErrorState, Loading, Notice, Tier } from '../../components/ui.jsx';
import { IndustryVsProfessionalChart, SkillRankingChart } from '../../components/charts.jsx';
import AdminNav from './AdminNav.jsx';

const RAMP = ['#f1f4f9', '#dbe8fb', '#a9c8f2', '#6fa3e6', '#2a78d6', '#1a4f99'];
const heat = (v) => RAMP[v === null || v === undefined ? 0 : Math.min(5, 1 + Math.floor(v * 5))];

function AnalysisRunner({ onDone }) {
  const runs = useApi(() => api.analysisRuns(), []);
  const latest = runs.data?.runs?.[0];
  const [includeDemo, setIncludeDemo] = useState(true);
  const [weights, setWeights] = useState({ industry: 0.5, professional: 0.35, beginner: 0.15 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await api.analyze({ includeDemo, weights });
      setMsg(`Analysis run #${res.run.id} complete — ${res.scoreCount} role–skill scores from ${res.run.postings_used} postings and ${res.run.responses_used} professional responses.`);
      runs.reload();
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="card mb">
      <div className="card-header">
        <div><h3><RefreshCw size={16} style={{ verticalAlign: -2 }} /> Run / refresh skill analysis</h3>
          <p>{latest ? `Current: run #${latest.id} · ${new Date(latest.created_at).toLocaleString()} · ${latest.postings_used} postings · ${latest.responses_used} responses · ${latest.includes_demo ? 'includes demo' : 'no demo'}` : 'No runs yet'}</p></div>
      </div>
      <div className="grid grid-4" style={{ alignItems: 'end' }}>
        {[['industry', 'Industry demand (wD)'], ['professional', 'Professional usage (wP)'], ['beginner', 'Beginner importance (wB)']].map(([k, label]) => (
          <div className="field" key={k} style={{ marginBottom: 0 }}>
            <label htmlFor={`w-${k}`}>{label}: {weights[k].toFixed(2)}</label>
            <input id={`w-${k}`} type="range" min="0" max="1" step="0.05" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
          </div>
        ))}
        <div className="stack" style={{ gap: 8 }}>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} /> Include demo data</label>
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy}><PlayCircle size={16} /> {busy ? 'Running…' : 'Run analysis'}</button>
        </div>
      </div>
      <p className="tiny muted mt" style={{ marginBottom: 0 }}>Weights are normalised by the signals available for each role. Changing them is a sensitivity check — record the weights you report.</p>
      {msg && <Notice kind="success" className="mt">{msg}</Notice>}
      {error && <div className="mt"><ErrorState error={error} /></div>}
    </div>
  );
}

function RoleDrilldown({ roles }) {
  const [slug, setSlug] = useState('data-scientist');
  const { data, loading, error } = useApi(() => api.roleAnalysis(slug), [slug]);
  const comparison = (data?.skills || []).filter((s) => s.industryDemand !== null && s.professionalUsage !== null && s.score > 0).slice(0, 12)
    .map((s) => ({ name: s.name, industry: Math.round(s.industryDemand * 100), professional: Math.round(s.professionalUsage * 100) }));
  return (
    <div className="card mb">
      <div className="card-header">
        <div><h3>Role-specific skills</h3><p>Ranking and industry vs professional comparison for one role</p></div>
        <select className="select" style={{ width: 240 }} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Role">
          {roles.map((r) => <option key={r.slug} value={r.slug}>{r.role}</option>)}
        </select>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} />}
      {data && (
        <>
          <DataBasisNote dataBasis={data.dataBasis} />
          <div className="grid grid-2 mt">
            <div>{data.dataBasis.basis === 'data' ? <SkillRankingChart data={data.skills.filter((s) => s.score > 0).slice(0, 12).map((s) => ({ name: s.name, score: s.score }))} /> : <Empty title="No data for this role in the current run" />}</div>
            <div>{comparison.length ? <IndustryVsProfessionalChart data={comparison} /> : <Empty title="Needs both postings and professional responses" />}</div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminAnalytics() {
  const { data, error, loading, reload } = useApi(() => api.adminAnalytics(), []);
  const roleOptions = useMemo(() => {
    const seen = new Map();
    for (const r of data?.skills.topByRole || []) seen.set(r.slug, r.role);
    return [...seen.entries()].map(([slug, role]) => ({ slug, role }));
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;
  const sk = data.skills;

  const matrix = {};
  for (const c of sk.roleComparison.cells) {
    matrix[c.role] ||= {};
    matrix[c.role][c.skill] = c.share;
  }
  const byRole = {};
  for (const r of sk.topByRole) (byRole[r.role] ||= []).push(r);
  const common = sk.mostCommon.slice(0, 15);

  return (
    <div className="container page">
      <div className="page-header"><div><div className="eyebrow">Admin / research team</div><h1>Skill analytics</h1><p>Most common skills, role comparison and the ranking engine.</p></div></div>
      <AdminNav />

      <AnalysisRunner onDone={reload} />

      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-header"><div><h3>Most common skills (all postings)</h3><p>{sk.postingTotal} postings · share mentioning each skill</p></div></div>
          {common.length ? <SkillRankingChart data={common.map((c) => ({ name: c.name, score: Math.round(c.postingShare * 1000) / 10 }))} /> : <Empty title="No postings imported" />}
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Industry vs professional</h3><p>Same skills: % of postings vs % of {sk.professionalTotal} professionals using them</p></div></div>
          {common.length && sk.professionalTotal ? (
            <IndustryVsProfessionalChart data={common.slice(0, 12).map((c) => ({ name: c.name, industry: Math.round(c.postingShare * 100), professional: Math.round((c.professionalShare || 0) * 100) }))} />
          ) : <Empty title="Needs postings and professional responses" />}
        </div>
      </div>

      <div className="card mb">
        <div className="card-header"><div><h3>Role comparison</h3><p>Share of each role’s postings that mention the 12 most common skills</p></div></div>
        {sk.roleComparison.skills.length ? (
          <div className="table-wrap">
            <table className="table heat">
              <thead><tr><th>Role</th>{sk.roleComparison.skills.map((s) => <th key={s} style={{ textAlign: 'center' }}>{s}</th>)}</tr></thead>
              <tbody>
                {Object.keys(matrix).sort().map((role) => (
                  <tr key={role}>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}><strong>{role}</strong></td>
                    {sk.roleComparison.skills.map((s) => {
                      const v = matrix[role][s];
                      return <td key={s} className="cell" style={{ background: heat(v), color: v >= 0.6 ? '#fff' : 'var(--text)' }} title={`${role} · ${s}: ${pct(v)}`}>{v ? pct(v) : '·'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No postings imported" />}
      </div>

      {roleOptions.length > 0 && <RoleDrilldown roles={roleOptions} />}

      <div className="grid grid-3">
        <div className="card span-2">
          <div className="card-header"><div><h3>Skill rankings by role</h3><p>Top 5 skills per role in the current analysis run</p></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Role</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead>
              <tbody>{Object.entries(byRole).map(([role, list]) => (
                <tr key={role}><td className="small"><strong>{role}</strong></td>{list.map((r) => <td key={r.skill} className="small">{r.skill}<div><Tier tier={r.tier} /> <span className="tiny muted">{r.score}</span></div></td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Skill categories</h3><p>Mentions across all postings</p></div></div>
          {sk.categories.map((c) => (
            <div key={c.category} className="row between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}><span>{c.category}</span><strong>{c.mentions}</strong></div>
          ))}
        </div>
      </div>
    </div>
  );
}
