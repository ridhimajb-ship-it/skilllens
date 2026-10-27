import { useState } from 'react';
import { Upload, FileCheck2, Download, Trash2, Wand2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, download } from '../../api/client.js';
import { useApi } from '../../utils/useApi.js';
import { DataBadge, Empty, ErrorState, Loading, Notice, Tabs } from '../../components/ui.jsx';
import AdminNav from './AdminNav.jsx';

const KINDS = {
  jobs: { label: 'Job postings', template: 'jobs', file: 'job_postings_template.csv' },
  professional: { label: 'Professional responses', template: 'professional', file: 'professional_responses_template.csv' },
  'student-validation': { label: 'Student validation responses', template: 'student-validation', file: 'student_validation_template.csv' },
};
const STEPS = ['Upload', 'Preview & validate', 'Import', 'Done'];

function ImportWizard({ onImported }) {
  const [kind, setKind] = useState('jobs');
  const [origin, setOrigin] = useState('imported');
  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [analyze, setAnalyze] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const step = result ? 3 : preview ? 1 : 0;
  const format = file?.name?.toLowerCase().endsWith('.json') ? 'json' : 'csv';

  const reset = () => { setFile(null); setContent(''); setPreview(null); setResult(null); setError(null); };
  const onFile = async (f) => {
    reset();
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setError(new Error('File is larger than 8 MB.')); return; }
    setFile(f);
    setContent(await f.text());
  };
  const doPreview = async () => {
    setBusy(true); setError(null);
    try { setPreview(await api.previewImport(kind, { format, content, filename: file.name, dataOrigin: origin })); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const doImport = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.runImport(kind, { format, content, filename: file.name, dataOrigin: origin, analyze });
      setResult(res);
      onImported();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const summary = preview?.summary;
  return (
    <div className="card mb">
      <div className="card-header">
        <div><h3><Upload size={16} style={{ verticalAlign: -2 }} /> Import data</h3><p>Upload → preview → validate columns → import → normalise skills → analyse → dashboards update</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`/admin/templates/${KINDS[kind].template}`, KINDS[kind].file)}><Download size={14} /> CSV template</button>
      </div>
      <div className="row small mb" style={{ gap: 6 }}>
        {STEPS.map((s, i) => <span key={s} className={`badge ${i <= step ? 'badge-imported' : 'badge-neutral'}`}>{i + 1}. {s}</span>)}
      </div>
      <div className="grid grid-3">
        <div className="field"><label htmlFor="kind">Dataset</label>
          <select id="kind" className="select" value={kind} onChange={(e) => { setKind(e.target.value); reset(); }}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="origin">Data origin</label>
          <select id="origin" className="select" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="imported">Imported (unverified provenance)</option>
            <option value="real">Real (collected by the team, with sources)</option>
          </select>
          <span className="hint">Never label synthetic or example data as real.</span></div>
        <div className="field"><label htmlFor="file">File (CSV or JSON, max 8 MB)</label>
          <input id="file" type="file" accept=".csv,.json,text/csv,application/json" className="input" onChange={(e) => onFile(e.target.files?.[0])} /></div>
      </div>
      {file && !preview && <button type="button" className="btn btn-primary" onClick={doPreview} disabled={busy || !content}><FileCheck2 size={16} /> {busy ? 'Validating…' : 'Preview & validate'}</button>}
      {error && <div className="mt"><ErrorState error={error} /></div>}

      {preview && !result && (
        <div className="mt">
          {preview.missingRequired?.length > 0 && <Notice kind="error" className="mb">Missing required column(s): <strong>{preview.missingRequired.join(', ')}</strong>. Use the template headers.</Notice>}
          <div className="grid grid-4 mb">
            <div className="card flat"><div className="stat-label">Rows</div><div className="stat-value">{summary.total}</div></div>
            <div className="card flat"><div className="stat-label">Valid</div><div className="stat-value" style={{ color: 'var(--good)' }}>{summary.valid}</div></div>
            <div className="card flat"><div className="stat-label">Invalid</div><div className="stat-value" style={{ color: summary.invalid ? 'var(--bad)' : undefined }}>{summary.invalid}</div></div>
            {kind === 'jobs' ? <div className="card flat"><div className="stat-label">Duplicates / unclassified</div><div className="stat-value">{summary.duplicatesInFile} / {summary.unclassified}</div></div> : <div className="card flat"><div className="stat-label">Columns ignored</div><div className="stat-value">{preview.columns.ignored.length}</div></div>}
          </div>
          <div className="small mb"><strong>Column mapping: </strong>{Object.entries(preview.columns.mapped).filter(([, v]) => v).map(([k, v]) => `${v} → ${k}`).join(' · ')}
            {preview.columns.ignored.length > 0 && <span className="muted"> · ignored: {preview.columns.ignored.join(', ')}</span>}</div>
          {kind === 'jobs' && summary.byRole && <div className="chips mb">{Object.entries(summary.byRole).map(([r, n]) => <span key={r} className="chip">{r}: {n}</span>)}</div>}
          {preview.topUnmapped?.length > 0 && <Notice kind="warn" className="mb">Unmapped skill terms (will be kept for review): {preview.topUnmapped.slice(0, 12).map((t) => `${t.term} (${t.count})`).join(', ')}</Notice>}
          <div className="table-wrap mb" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>#</th>{kind === 'jobs' ? <><th>Title</th><th>Role</th><th>Extracted skills</th></> : kind === 'professional' ? <><th>Role</th><th>Skills</th></> : <><th>Would use</th><th>Confusing part</th></>}<th>Issues</th></tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.rowNumber}>
                  <td className="muted">{r.rowNumber}</td>
                  {kind === 'jobs' ? <><td className="small">{r.title || '—'}<div className="tiny muted">{r.company}</div></td><td className="small">{r.role || <span className="muted">Unclassified</span>}{r.roleMatch && <div className="tiny muted">by {r.roleMatch}</div>}</td><td className="small">{r.skills.join(', ') || '—'}</td></>
                    : kind === 'professional' ? <><td className="small">{r.role || '—'}</td><td className="small">{r.skills.join(', ')}</td></>
                      : <><td className="small">{r.wouldUsePlatform || '—'}</td><td className="small">{r.confusingPart || '—'}</td></>}
                  <td className="small">{[...(r.errors || [])].map((e) => <div key={e} className="error-text">{e}</div>)}{[...(r.warnings || [])].map((w) => <div key={w} style={{ color: 'var(--warn)' }}>{w}</div>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row between">
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} disabled={kind === 'student-validation'} /> Re-run skill analysis after import</label>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy || !summary.valid || preview.missingRequired?.length > 0}>{busy ? 'Importing…' : `Import ${summary.valid} valid row(s)`}</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <Notice kind="success" className="mt">
          Imported <strong>{result.imported}</strong> of {result.total} row(s){result.duplicatesInDb ? `, ${result.duplicatesInDb} already in the database (skipped)` : ''}{result.invalid ? `, ${result.invalid} invalid` : ''}.
          {result.analysisRunId && <> Skill analysis re-run (#{result.analysisRunId}); dashboards are updated.</>}
          <div className="mt"><button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Import another file</button></div>
        </Notice>
      )}
    </div>
  );
}

function JobRecords({ version }) {
  const [filters, setFilters] = useState({ page: 1, origin: '', role: '', q: '' });
  const roles = useApi(() => api.roles(), []);
  const { data, loading, error } = useApi(() => api.jobPostings({ ...filters, pageSize: 15 }), [filters.page, filters.origin, filters.role, filters.q, version]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  return (
    <>
      <div className="row mb">
        <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 30, width: 220 }} placeholder="Title or company" value={filters.q} onChange={(e) => set({ q: e.target.value })} /></div>
        <select className="select" style={{ width: 200 }} value={filters.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role filter">
          <option value="">All roles</option>{roles.data?.roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={filters.origin} onChange={(e) => set({ origin: e.target.value })} aria-label="Origin filter">
          <option value="">All origins</option><option value="real">Real</option><option value="imported">Imported</option><option value="demo">Demo</option>
        </select>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => download(`/admin/job-postings/export.csv?origin=${filters.origin}&role=${filters.role}`, 'skilllens_job_postings.csv')}><Download size={14} /> Export CSV</button>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} />}
      {data && (data.rows.length === 0 ? <Empty title="No postings match" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Role</th><th>Location</th><th>Posted</th><th>Source</th><th>Skills</th><th>Origin</th></tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="small"><strong>{r.title}</strong><div className="tiny muted">{r.company}</div></td>
                  <td className="small">{r.role || <span className="muted">Unclassified</span>}</td>
                  <td className="small">{r.location || '—'}</td>
                  <td className="small">{r.posted_date || '—'}</td>
                  <td className="small">{r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener">{r.source || 'link'}</a> : r.source || '—'}</td>
                  <td className="small" style={{ maxWidth: 320 }}>{r.skills.join(', ')}</td>
                  <td><DataBadge origin={r.data_origin} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row between mt small">
            <span className="muted">{data.total} posting(s)</span>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft size={14} /></button>
              <span>Page {filters.page} of {pages}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      ))}
    </>
  );
}

function ProfessionalRecords({ version }) {
  const { data, loading, error } = useApi(() => api.professionalResponses(), [version]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <div className="row between mb"><span className="small muted">{data.total} response(s)</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/admin/professional-responses/export.csv', 'skilllens_professional_responses.csv')}><Download size={14} /> Export CSV</button></div>
      {data.rows.length === 0 ? <Empty title="No professional responses" /> : (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Role</th><th>Industry</th><th>Experience</th><th>Uses</th><th>Beginner picks</th><th>Submitted</th><th>Origin</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}><td className="small"><strong>{r.role}</strong></td><td className="small">{r.industry}</td><td className="small">{r.experience_band}</td>
                <td className="small" style={{ maxWidth: 300 }}>{r.uses.join(', ')}</td><td className="small">{r.beginner.join(', ')}</td><td className="small">{r.submitted_at}</td><td><DataBadge origin={r.data_origin} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StudentRecords({ version }) {
  const { data, loading, error } = useApi(() => api.studentResponses(), [version]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <div className="row between mb"><span className="small muted">{data.total} response(s)</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/admin/student-validation/export.csv', 'skilllens_student_validation.csv')}><Download size={14} /> Export CSV</button></div>
      {data.rows.length === 0 ? <Empty title="Validation data will be populated through student research." /> : (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Year</th><th>Target role</th><th>Confusing part</th><th>Trusts</th><th>Would use</th><th>Submitted</th><th>Origin</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}><td className="small">{r.study_year || '—'}</td><td className="small">{r.target_role || '—'}</td><td className="small">{r.confusing_part}</td>
                <td className="small">{(r.trusted_sources || []).join(', ')}</td><td className="small">{r.would_use_platform}</td><td className="small">{r.submitted_at}</td><td><DataBadge origin={r.data_origin} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function QualityPanel({ quality, skills, onChanged }) {
  const [aliasFor, setAliasFor] = useState({});
  const [msg, setMsg] = useState(null);
  const addAlias = async (term) => {
    const skillId = Number(aliasFor[term]);
    if (!skillId) return;
    try {
      await api.addAlias(skillId, term);
      setMsg({ kind: 'success', text: `“${term}” now maps to ${skills.find((s) => s.id === skillId)?.name}. Re-import affected files to apply it to existing records.` });
      onChanged();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  const j = quality.jobs;
  return (
    <div className="grid grid-2 mb">
      <div className="card">
        <h3>Data quality</h3>
        <div className="table-wrap">
          <table className="table"><tbody>
            {[
              ['Job postings', j.total], ['Unclassified (no role)', j.unclassified], ['Without any recognised skill', j.without_skills],
              ['Missing posting date', j.missing_date], ['Missing source', j.missing_source], ['Missing URL', j.missing_url],
              ['Older than 12 months', j.older_than_12_months], ['Role assigned from title (not explicit)', j.classified_by_title],
            ].map(([label, v]) => <tr key={label}><td className="small">{label}</td><td className="num"><strong>{v}</strong></td></tr>)}
          </tbody></table>
        </div>
        <h3 className="mt">Role coverage</h3>
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Role</th><th className="num">Postings (non-demo)</th><th className="num">Pros (non-demo)</th><th>Confidence</th></tr></thead>
            <tbody>{quality.roles.map((r) => <tr key={r.slug}><td className="small">{r.name}</td><td className="num">{r.postings} ({r.non_demo_postings})</td><td className="num">{r.professionals} ({r.non_demo_professionals})</td><td className="small" style={{ textTransform: 'capitalize' }}>{r.confidence}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Unmapped skill terms</h3>
        <p className="small muted">Terms from skills columns and surveys that did not match the taxonomy. Map genuine skills to an existing canonical skill.</p>
        {msg && <Notice kind={msg.kind} className="mb">{msg.text}</Notice>}
        {quality.unmappedTerms.length === 0 ? <Empty title="No unmapped terms" /> : (
          <div className="stack" style={{ gap: 8 }}>
            {quality.unmappedTerms.slice(0, 15).map((t) => (
              <div key={t.term} className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="small" style={{ flex: 1 }}><strong>{t.term}</strong> <span className="muted">× {t.n}</span></span>
                <select className="select" style={{ width: 180 }} value={aliasFor[t.term] || ''} onChange={(e) => setAliasFor({ ...aliasFor, [t.term]: e.target.value })} aria-label={`Map ${t.term}`}>
                  <option value="">Map to skill…</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!aliasFor[t.term]} onClick={() => addAlias(t.term)}>Add alias</button>
              </div>
            ))}
          </div>
        )}
        <h3 className="mt">Recent imports</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Dataset</th><th>File</th><th className="num">Imported</th><th>Origin</th></tr></thead>
            <tbody>{quality.recentImports.map((b) => <tr key={b.id}><td className="muted">{b.id}</td><td className="small">{b.kind}</td><td className="small">{b.filename || '—'}</td><td className="num">{b.rows_imported}/{b.rows_total}</td><td><DataBadge origin={b.data_origin} /></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NormalizationTester() {
  const [input, setInput] = useState('Postgres, ReactJS, Python 3, AWS/Azure, k8s, Underwater welding');
  const [out, setOut] = useState(null);
  const run = async () => setOut(await api.normalize(input.split(',').map((s) => s.trim()).filter(Boolean)));
  return (
    <div className="card mb">
      <h3><Wand2 size={16} style={{ verticalAlign: -2 }} /> Skill normalization tester</h3>
      <p className="small muted">See exactly how raw terms are mapped to canonical skills.</p>
      <div className="row"><input className="input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} /><button type="button" className="btn btn-primary" onClick={run}>Normalize</button></div>
      {out && <div className="chips mt">{out.terms.map((t) => <span key={t.term} className={`chip ${t.mapped ? 'chip-blue' : ''}`}>{t.term} → {t.mapped ? t.canonical.join(' + ') : 'unmapped'}</span>)}</div>}
    </div>
  );
}

function DangerZone({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const remove = async () => {
    if (!window.confirm('Remove all demo job postings and demo professional responses? Real and imported data are kept. This cannot be undone.')) return;
    setBusy(true);
    try {
      const res = await api.deleteDemoData();
      setMsg(`Removed ${res.deleted.jobPostings} demo postings and ${res.deleted.professionalResponses} demo professional responses. Analysis re-run (#${res.analysisRunId}).`);
      onDone();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ borderColor: '#fecaca' }}>
      <h3>Remove demo data</h3>
      <p className="small muted">Once real data is imported, remove the synthetic demo records so every dashboard reflects research data only. Roles without real data will fall back to the labelled hypothesis.</p>
      <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}><Trash2 size={15} /> {busy ? 'Removing…' : 'Remove demo data'}</button>
      {msg && <p className="small mt">{msg}</p>}
    </div>
  );
}

export default function AdminData() {
  const [tab, setTab] = useState('jobs');
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const quality = useApi(() => api.get('/admin/data-quality'), [version]);
  const skills = useApi(() => api.skills(), [version]);

  return (
    <div className="container page">
      <div className="page-header"><div><div className="eyebrow">Admin / research team</div><h1>Data management</h1><p>Import CSV/JSON, inspect records, monitor data quality and maintain the skill taxonomy.</p></div></div>
      <AdminNav />
      <ImportWizard onImported={bump} />

      <div className="card mb">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'jobs', label: 'Job postings' }, { value: 'pro', label: 'Professional responses' }, { value: 'students', label: 'Student validation' }]} />
        {tab === 'jobs' && <JobRecords version={version} />}
        {tab === 'pro' && <ProfessionalRecords version={version} />}
        {tab === 'students' && <StudentRecords version={version} />}
      </div>

      {quality.data && skills.data && <QualityPanel quality={quality.data} skills={skills.data.skills} onChanged={bump} />}
      <NormalizationTester />
      <DangerZone onDone={bump} />
    </div>
  );
}
