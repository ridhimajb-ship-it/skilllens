import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../utils/useApi.js';
import { ErrorState, Loading, Notice } from '../components/ui.jsx';
import SkillPicker from '../components/SkillPicker.jsx';

export const GUEST_KEY = 'skilllens_guest_assessment';

function readGuest() {
  try { return JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null'); } catch { return null; }
}

export default function Assessment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isStudent = user?.role === 'student';

  const catalog = useApi(() => api.skills(), []);
  const roles = useApi(() => api.roles(), []);
  const [role, setRole] = useState(params.get('role') || '');
  const [skills, setSkills] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadedProfile, setLoadedProfile] = useState(false);

  // Prefill from the saved profile (students) or from this browser session (guests).
  useEffect(() => {
    if (loadedProfile) return;
    if (isStudent) {
      api.studentProfile().then((res) => {
        if (!params.get('role') && res.profile?.target_role_slug) setRole(res.profile.target_role_slug);
        setSkills(res.skills.map((s) => ({ skillId: s.skillId ?? undefined, name: s.name, category: s.category, level: s.level })));
      }).catch(() => {}).finally(() => setLoadedProfile(true));
    } else {
      const guest = readGuest();
      if (guest) {
        if (!params.get('role')) setRole(guest.role);
        setSkills(guest.skills || []);
      }
      setLoadedProfile(true);
    }
  }, [isStudent, loadedProfile, params]);

  const roleAnalysis = useApi(() => (role ? api.roleAnalysis(role) : Promise.resolve(null)), [role]);
  const suggestions = useMemo(() => (roleAnalysis.data?.skills || []).filter((s) => s.score >= 25).slice(0, 14).map((s) => s.name), [roleAnalysis.data]);

  const submit = async () => {
    setError(null);
    if (!role) { setError(new Error('Choose a target role first.')); return; }
    setBusy(true);
    const payload = skills.map((s) => ({ ...(s.skillId ? { skillId: s.skillId } : {}), name: s.name, level: s.level }));
    try {
      if (isStudent) {
        await api.saveProfile({ targetRole: role });
        await api.saveSkills(payload);
        navigate(`/gap?role=${role}`);
      } else {
        const result = await api.computeGap(role, payload);
        sessionStorage.setItem(GUEST_KEY, JSON.stringify({ role, skills, result }));
        navigate(`/gap?role=${role}`);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (catalog.loading || roles.loading || !loadedProfile) return <Loading />;
  if (catalog.error || roles.error) return <div className="container page"><ErrorState error={catalog.error || roles.error} /></div>;

  return (
    <div className="container page" style={{ maxWidth: 880 }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Student skill assessment</div>
          <h1>Assess my skills</h1>
          <p>Choose the role you are aiming for, then add the skills you already have and rate each one honestly.</p>
        </div>
      </div>
      {!isStudent && (
        <Notice kind="info" className="mb">
          You are using guest mode — results stay in this browser tab. <Link to="/register">Create a student account</Link> to save your profile and track progress on your dashboard.
        </Notice>
      )}

      <div className="card mb">
        <h3>1. Career goal</h3>
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Target role">
          <option value="">Select a target role…</option>
          {roles.data.roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
        </select>
      </div>

      <div className="card mb">
        <div className="card-header">
          <div><h3>2. Your current skills</h3><p>{skills.length} selected</p></div>
        </div>
        <details className="small muted mb">
          <summary style={{ cursor: 'pointer' }}><Info size={13} style={{ verticalAlign: -2 }} /> How to rate yourself</summary>
          <ul style={{ marginTop: 6 }}>
            <li><strong>Beginner</strong> — followed tutorials or a course; can do basic tasks with help.</li>
            <li><strong>Intermediate</strong> — used it in your own projects; can solve typical problems independently.</li>
            <li><strong>Advanced</strong> — used it in substantial projects or internships; could explain it to others.</li>
          </ul>
        </details>
        <SkillPicker catalog={catalog.data.skills} value={skills} onChange={setSkills} suggestions={suggestions} />
      </div>

      {error && <div className="mb"><ErrorState error={error} /></div>}
      <div className="row between">
        <span className="small muted">Your skills are compared with the role&apos;s ranked skills from the latest analysis.</span>
        <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy || !role}>
          {busy ? 'Analysing…' : 'Show my skill gap'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
