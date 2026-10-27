import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Search, Send, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';
import { ErrorState, Loading } from '../components/ui.jsx';
import { MultiChoice, Question, SingleChoice, SurveyProgress, ThankYou } from '../components/SurveyKit.jsx';

const TOOL_TYPES = new Set(['tool', 'platform', 'library']);
const STEPS = ['About you', 'Skills & tools', 'Advice for beginners', 'Contributing'];

/** Toggle chips for skills, plus a search box for anything not suggested. */
function SkillChips({ catalog, suggested, value, onChange, max, placeholder }) {
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const shown = useMemo(() => [...new Set([...suggested, ...value])].map((id) => byId.get(id)).filter(Boolean), [suggested, value, byId]);
  const results = q.trim() ? catalog.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()) && !shown.some((x) => x.id === s.id)).slice(0, 6) : [];
  const toggle = (id) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (!max || value.length < max) onChange([...value, id]);
  };
  return (
    <div>
      <div className="chips mb">
        {shown.map((s) => {
          const on = value.includes(s.id);
          return (
            <button type="button" key={s.id} aria-pressed={on} onClick={() => toggle(s.id)}
              className={`chip ${on ? 'chip-blue' : ''}`} style={{ cursor: 'pointer', fontWeight: on ? 600 : 400, opacity: !on && max && value.length >= max ? 0.5 : 1 }}>
              {on ? '✓ ' : '+ '}{s.name}
            </button>
          );
        })}
      </div>
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
        <input className="input" style={{ paddingLeft: 32 }} placeholder={placeholder || 'Search for another skill…'} value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 44, padding: 6 }}>
            {results.map((s) => <button key={s.id} type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { toggle(s.id); setQ(''); }}>{s.name}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY = {
  role: '', industry: '', experienceBand: '', skillsUsed: [], toolsUsed: [], otherSkills: '', beginnerSkills: [],
  overemphasizedSkills: [], beginnerMistakes: '', wishLearnedEarlier: '', workReality: '', willingToContribute: '', motivation: [], consent: false,
};

export default function ProfessionalSurvey() {
  const options = useApi(() => api.surveyOptions(), []);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const roleSkills = useApi(() => (form.role ? api.roleAnalysis(form.role) : Promise.resolve(null)), [form.role]);
  const catalog = options.data?.skills || [];
  const suggestions = useMemo(() => {
    const list = (roleSkills.data?.skills || []).slice(0, 30);
    return {
      skills: list.filter((s) => !TOOL_TYPES.has(s.type)).map((s) => s.skillId).slice(0, 18),
      tools: list.filter((s) => TOOL_TYPES.has(s.type)).map((s) => s.skillId).slice(0, 12),
    };
  }, [roleSkills.data]);
  const used = [...form.skillsUsed, ...form.toolsUsed];

  const canNext = [
    form.role && form.industry && form.experienceBand,
    used.length > 0 || form.otherSkills.trim(),
    true,
    form.willingToContribute && form.consent,
  ][step];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.submitProfessional({ ...form, otherSkills: form.otherSkills || null });
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (options.loading) return <Loading />;
  if (options.error) return <div className="container page"><ErrorState error={options.error} /></div>;
  const P = options.data.professional;

  if (done) {
    return (
      <div className="container page survey">
        <ThankYou title="Thank you for contributing">
          <p>Your response has been stored and will be aggregated with other professionals&apos; answers. Individual responses are never shown with names.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to={`/roles/${form.role}`} className="btn btn-primary">See the {options.data.roles.find((r) => r.slug === form.role)?.name} skill map</Link>
            <button type="button" className="btn btn-secondary" onClick={() => { setForm(EMPTY); setStep(0); setDone(false); }}>Submit another role</button>
          </div>
        </ThankYou>
      </div>
    );
  }

  return (
    <div className="container page survey">
      <div className="page-header">
        <div>
          <div className="eyebrow">Professional survey</div>
          <h1>Help students understand what work actually looks like.</h1>
          <p>Tell us which skills and tools you really use, and what beginners get wrong. Your answers shape the skill priorities students see.</p>
          <div className="row small muted mt" style={{ gap: 16 }}><span className="row" style={{ gap: 4 }}><Clock size={14} /> 3–5 minutes</span><span className="row" style={{ gap: 4 }}><ShieldCheck size={14} /> No name or employer collected</span></div>
        </div>
      </div>
      <div className="card">
        <SurveyProgress step={step} total={STEPS.length} labels={STEPS} />

        {step === 0 && (
          <>
            <Question label="Which role best describes your current job?" required>
              <select className="select" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, skillsUsed: [], toolsUsed: [], beginnerSkills: [], overemphasizedSkills: [] }))} aria-label="Role">
                <option value="">Select your role…</option>
                {options.data.roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
              </select>
            </Question>
            <Question label="Industry" required><SingleChoice name="industry" options={P.industry} value={form.industry} onChange={set('industry')} /></Question>
            <Question label="Years of experience in this kind of role" required><SingleChoice name="exp" options={P.experienceBand} value={form.experienceBand} onChange={set('experienceBand')} /></Question>
          </>
        )}

        {step === 1 && (
          <>
            <Question label="Which skills do you use regularly (at least weekly)?" hint="Suggestions come from this role's skill map. Select only what you actually use." required>
              <SkillChips catalog={catalog.filter((s) => !TOOL_TYPES.has(s.type))} suggested={suggestions.skills} value={form.skillsUsed} onChange={set('skillsUsed')} />
            </Question>
            <Question label="Which tools, platforms or libraries do you use regularly?">
              <SkillChips catalog={catalog.filter((s) => TOOL_TYPES.has(s.type))} suggested={suggestions.tools} value={form.toolsUsed} onChange={set('toolsUsed')} placeholder="Search for another tool…" />
            </Question>
            <Question label="Anything else you use that is not listed?" hint="Comma-separated, e.g. Looker, dbt, Kafka">
              <input className="input" value={form.otherSkills} onChange={(e) => set('otherSkills')(e.target.value)} maxLength={300} />
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question label="Which skills matter most for a beginner in this role?" hint="Pick up to 5.">
              <SkillChips catalog={catalog} suggested={used.length ? used : suggestions.skills} value={form.beginnerSkills} onChange={set('beginnerSkills')} max={5} />
            </Question>
            <Question label="Which skills are overemphasized for beginners?" hint="Skills students spend time on that matter less early on. Pick up to 5 (optional).">
              <SkillChips catalog={catalog} suggested={[...suggestions.skills, ...suggestions.tools].slice(0, 16)} value={form.overemphasizedSkills} onChange={set('overemphasizedSkills')} max={5} />
            </Question>
            <Question label="What mistakes do beginners commonly make?">
              <textarea className="textarea" value={form.beginnerMistakes} onChange={(e) => set('beginnerMistakes')(e.target.value)} maxLength={2000} />
            </Question>
            <Question label="What do you wish you had learned earlier?">
              <textarea className="textarea" value={form.wishLearnedEarlier} onChange={(e) => set('wishLearnedEarlier')(e.target.value)} maxLength={2000} />
            </Question>
            <Question label="In one or two sentences, what does your day-to-day work actually look like? (optional)">
              <textarea className="textarea" value={form.workReality} onChange={(e) => set('workReality')(e.target.value)} maxLength={2000} />
            </Question>
          </>
        )}

        {step === 3 && (
          <>
            <Question label="Would you be willing to spend 3–5 minutes contributing again in future (e.g. yearly updates)?" required>
              <SingleChoice name="willing" options={P.willingToContribute} value={form.willingToContribute} onChange={set('willingToContribute')} />
            </Question>
            <Question label="What motivates you to contribute?" hint="Select all that apply.">
              <MultiChoice name="motivation" options={P.motivation} value={form.motivation} onChange={set('motivation')} />
            </Question>
            <label className={`choice ${form.consent ? 'selected' : ''}`} style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={form.consent} onChange={(e) => set('consent')(e.target.checked)} />
              <span>I agree that my anonymous answers may be stored and used in aggregated form for the SkillLens research project.</span>
            </label>
          </>
        )}

        {error && <div className="mt"><ErrorState error={error} /></div>}
        <hr className="divider" />
        <div className="row between">
          <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft size={16} /> Back</button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Next <ArrowRight size={16} /></button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!canNext || busy}><Send size={16} /> {busy ? 'Submitting…' : 'Submit response'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
