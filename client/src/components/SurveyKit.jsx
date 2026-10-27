import { CheckCircle2 } from 'lucide-react';

export function SurveyProgress({ step, total, labels }) {
  return (
    <div className="survey-progress" aria-label={`Step ${step + 1} of ${total}`}>
      <span className="small" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Step {step + 1} of {total}</span>
      <div className="progress"><div style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{labels[step]}</span>
    </div>
  );
}

export function Question({ label, hint, children, required }) {
  return (
    <fieldset className="question" style={{ border: 0, padding: 0, margin: '0 0 22px' }}>
      <legend className="label" style={{ marginBottom: 4, fontSize: '0.95rem' }}>{label}{required && <span style={{ color: 'var(--bad)' }}> *</span>}</legend>
      {hint && <span className="hint" style={{ display: 'block', marginBottom: 10 }}>{hint}</span>}
      {children}
    </fieldset>
  );
}

export function SingleChoice({ name, options, value, onChange }) {
  return (
    <div className="choice-grid">
      {options.map((o) => (
        <label key={o} className={`choice ${value === o ? 'selected' : ''}`}>
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

export function MultiChoice({ name, options, value, onChange, max }) {
  const toggle = (o) => {
    if (value.includes(o)) onChange(value.filter((v) => v !== o));
    else if (!max || value.length < max) onChange([...value, o]);
  };
  return (
    <div className="choice-grid">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <label key={o} className={`choice ${on ? 'selected' : ''}`} style={!on && max && value.length >= max ? { opacity: 0.55 } : undefined}>
            <input type="checkbox" name={name} value={o} checked={on} onChange={() => toggle(o)} />
            {o}
          </label>
        );
      })}
    </div>
  );
}

export function ThankYou({ title, children }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <CheckCircle2 size={48} color="var(--good)" />
      <h2 className="mt">{title}</h2>
      <div className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>{children}</div>
    </div>
  );
}
