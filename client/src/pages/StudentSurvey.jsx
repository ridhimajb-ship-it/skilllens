import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Send, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';
import { ErrorState, Loading } from '../components/ui.jsx';
import { MultiChoice, Question, SingleChoice, SurveyProgress, ThankYou } from '../components/SurveyKit.jsx';

const STEPS = ['How you decide', 'What is hard', 'Would it help?'];
const EMPTY = {
  studyYear: '', fieldOfStudy: '', targetRole: '', decideMethods: [], sourceCount: '', learnedNotUseful: '', confusingPart: '',
  confusingText: '', conflictingAdvice: '', trustedSources: [], wouldUsePlatform: '', gapViewHelpful: '', comments: '', consent: false,
};

export default function StudentSurvey() {
  const options = useApi(() => api.surveyOptions(), []);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  if (options.loading) return <Loading />;
  if (options.error) return <div className="container page"><ErrorState error={options.error} /></div>;
  const O = options.data.studentValidation;

  const canNext = [
    form.decideMethods.length > 0 && form.sourceCount,
    form.learnedNotUseful && form.confusingPart && form.conflictingAdvice && form.trustedSources.length > 0,
    form.wouldUsePlatform && form.gapViewHelpful && form.consent,
  ][step];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.submitStudentValidation({
        ...form,
        studyYear: form.studyYear || null,
        fieldOfStudy: form.fieldOfStudy || null,
        targetRole: form.targetRole || null,
      });
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="container page survey">
        <ThankYou title="Thank you — your response has been recorded">
          <p>Your answers help us check whether students really struggle to prioritise skills. Results are only reported in aggregate.</p>
          <Link to="/assess" className="btn btn-primary">Try the skill assessment</Link>
        </ThankYou>
      </div>
    );
  }

  return (
    <div className="container page survey">
      <div className="page-header">
        <div>
          <div className="eyebrow">Student research survey</div>
          <h1>How do you decide what to learn?</h1>
          <p>This short survey helps the SkillLens team test whether the problem we are solving actually exists. There are no right answers.</p>
          <div className="row small muted mt" style={{ gap: 16 }}><span className="row" style={{ gap: 4 }}><Clock size={14} /> About 3 minutes</span><span className="row" style={{ gap: 4 }}><ShieldCheck size={14} /> Anonymous</span></div>
        </div>
      </div>
      <div className="card">
        <SurveyProgress step={step} total={STEPS.length} labels={STEPS} />

        {step === 0 && (
          <>
            <div className="grid grid-3">
              <div className="field"><label htmlFor="sy">Year of study</label>
                <select id="sy" className="select" value={form.studyYear} onChange={(e) => set('studyYear')(e.target.value)}>
                  <option value="">Prefer not to say</option>{O.studyYear.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="field"><label htmlFor="fs">Field of study</label><input id="fs" className="input" placeholder="e.g. Computer Science" value={form.fieldOfStudy} onChange={(e) => set('fieldOfStudy')(e.target.value)} maxLength={120} /></div>
              <div className="field"><label htmlFor="tr">Target role (if any)</label>
                <select id="tr" className="select" value={form.targetRole} onChange={(e) => set('targetRole')(e.target.value)}>
                  <option value="">Not decided</option>{options.data.roles.map((r) => <option key={r.slug}>{r.name}</option>)}
                </select></div>
            </div>
            <Question label="1. How do you currently decide which skills to learn for a career?" hint="Select all that apply." required>
              <MultiChoice name="decide" options={O.decideMethods} value={form.decideMethods} onChange={set('decideMethods')} />
            </Question>
            <Question label="4. How many different sources do you normally use to decide what to learn?" required>
              <SingleChoice name="sources" options={O.sourceCount} value={form.sourceCount} onChange={set('sourceCount')} />
            </Question>
          </>
        )}

        {step === 1 && (
          <>
            <Question label="2. Have you ever spent time learning a skill that turned out not to be useful for placements or jobs?" required>
              <SingleChoice name="useless" options={O.learnedNotUseful} value={form.learnedNotUseful} onChange={set('learnedNotUseful')} />
            </Question>
            <Question label="3. What is the most confusing part of preparing for a specific job role?" required>
              <SingleChoice name="confusing" options={O.confusingPart} value={form.confusingPart} onChange={set('confusingPart')} />
              <textarea className="textarea mt" placeholder="Optional: tell us more in your own words" value={form.confusingText} onChange={(e) => set('confusingText')(e.target.value)} maxLength={2000} />
            </Question>
            <Question label="5. Do different sources give you conflicting advice?" required>
              <SingleChoice name="conflict" options={O.conflictingAdvice} value={form.conflictingAdvice} onChange={set('conflictingAdvice')} />
            </Question>
            <Question label="6. Which sources do you trust most?" hint="Pick up to 3." required>
              <MultiChoice name="trust" options={O.trustedSources} value={form.trustedSources} onChange={set('trustedSources')} max={3} />
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question label="7. Would you use a platform that shows the skills actually used by working professionals in your target role?" required>
              <SingleChoice name="use" options={O.wouldUsePlatform} value={form.wouldUsePlatform} onChange={set('wouldUsePlatform')} />
            </Question>
            <Question label="8. Would seeing your skill gap (what you have vs what the role needs) help you decide what to learn next?" required>
              <SingleChoice name="gap" options={O.gapViewHelpful} value={form.gapViewHelpful} onChange={set('gapViewHelpful')} />
            </Question>
            <Question label="Anything else you would like to tell us? (optional)">
              <textarea className="textarea" value={form.comments} onChange={(e) => set('comments')(e.target.value)} maxLength={2000} />
            </Question>
            <label className={`choice ${form.consent ? 'selected' : ''}`} style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={form.consent} onChange={(e) => set('consent')(e.target.checked)} />
              <span>I agree that my anonymous answers may be stored and analysed in aggregate for the SkillLens research project.</span>
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
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!canNext || busy}><Send size={16} /> {busy ? 'Submitting…' : 'Submit'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
