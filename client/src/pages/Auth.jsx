import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, Field } from '../components/ui.jsx';

const HOME = { student: '/dashboard', professional: '/contribute', admin: '/admin' };

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="container page" style={{ maxWidth: 440 }}>
      <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow)' }}>
        <div className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 14 }}><ScanSearch size={20} /></div>
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        <p className="muted small">{subtitle}</p>
        {children}
      </div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>{footer}</p>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(form.email, form.password);
      navigate(params.get('next') || HOME[user.role] || '/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Sign in" subtitle="Students, professionals and the research team sign in here."
      footer={<>New to SkillLens? <Link to="/register">Create an account</Link></>}>
      <form onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="email"><input id="email" type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Password" htmlFor="password"><input id="password" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        {error && <div className="mb"><ErrorState error={error} /></div>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) { setError(new Error('Password must be at least 8 characters.')); return; }
    setBusy(true);
    try {
      const user = await register(form);
      navigate(user.role === 'student' ? '/assess' : '/contribute');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Create your account" subtitle="Save your skill profile and track your readiness — or contribute as a professional."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      <form onSubmit={submit} noValidate>
        <div className="row mb" role="radiogroup" aria-label="Account type">
          {[['student', 'I am a student'], ['professional', 'I am a professional']].map(([value, label]) => (
            <label key={value} className={`choice ${form.role === value ? 'selected' : ''}`} style={{ flex: 1 }}>
              <input type="radio" name="role" checked={form.role === value} onChange={() => setForm({ ...form, role: value })} /> {label}
            </label>
          ))}
        </div>
        <Field label="Full name" htmlFor="name"><input id="name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Email" htmlFor="remail"><input id="remail" type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Password" htmlFor="rpass" hint="At least 8 characters. Passwords are stored as salted bcrypt hashes."><input id="rpass" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        {error && <div className="mb"><ErrorState error={error} /></div>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </Shell>
  );
}
