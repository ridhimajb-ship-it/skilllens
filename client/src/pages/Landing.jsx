import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, Briefcase, Users, UserRound, Target, ClipboardList, MessageSquareHeart } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';
import { DataBadge, Priority } from '../components/ui.jsx';
import ResearchStatus from '../components/ResearchStatus.jsx';

// Static example used only to show what the output looks like. Clearly labelled "Illustrative".
const ILLUSTRATIVE = [
  { name: 'SQL', you: 'Beginner', expected: 'Advanced', priority: 'Very High' },
  { name: 'Statistics', you: 'Not yet', expected: 'Intermediate', priority: 'High' },
  { name: 'Machine Learning', you: 'Beginner', expected: 'Intermediate', priority: 'Medium' },
  { name: 'Python', you: 'Intermediate', expected: 'Advanced', priority: 'Medium' },
];

const PIPELINE = ['Job postings', 'Professional insights', 'Student profile', 'Cleaning', 'Skill extraction', 'Normalization', 'Skill ranking', 'Role skill map', 'Skill gap', 'Learning priorities'];

export default function Landing() {
  const { data } = useApi(() => api.roles(), []);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">SkillLens · Bridging education and industry skills</div>
            <h1>Know what to learn.<br /><span>Not just where to learn.</span></h1>
            <p className="lead">SkillLens connects industry requirements, professional insights, and your current skills to show you what to prioritize for your career.</p>
            <div className="row" style={{ gap: 12 }}>
              <Link to="/roles" className="btn btn-primary btn-lg">Explore Careers <ArrowRight size={18} /></Link>
              <Link to="/assess" className="btn btn-secondary btn-lg">Assess My Skills</Link>
            </div>
            <p className="small muted mt">Free research prototype · 16 career roles · transparent, explainable scoring</p>
          </div>
          <div className="card" style={{ boxShadow: 'var(--shadow)' }} aria-label="Illustrative example of a SkillLens result">
            <div className="row between mb">
              <div>
                <div className="tiny muted">Example output · Data Scientist</div>
                <h3 style={{ margin: 0 }}>Your learning priorities</h3>
              </div>
              <DataBadge origin="illustrative" />
            </div>
            <table className="table">
              <thead><tr><th>Skill</th><th>You</th><th>Expected</th><th>Priority</th></tr></thead>
              <tbody>
                {ILLUSTRATIVE.map((r) => (
                  <tr key={r.name}><td><strong>{r.name}</strong></td><td className="muted">{r.you}</td><td className="muted">{r.expected}</td><td><Priority value={r.priority} /></td></tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted mt" style={{ marginBottom: 0 }}>Illustrative values to show the format — not research results.</p>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="section-title">
            <div className="eyebrow">The problem</div>
            <h2>Learning resources are not the problem. Prioritising them is.</h2>
            <p>A student aiming for Data Scientist meets Python, SQL, Statistics, ML, Deep Learning, NLP, TensorFlow, PyTorch, Cloud, Docker, MLOps… and asks: <strong>what should I learn first?</strong></p>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="container">
          <div className="section-title">
            <div className="eyebrow">How SkillLens works</div>
            <h2>Three sources of evidence, one prioritised plan</h2>
          </div>
          <div className="flow">
            {[
              { icon: Briefcase, title: 'Industry data', text: 'Job postings are cleaned, classified into roles and scanned for skills. How often a skill appears = industry demand.' },
              { icon: Users, title: 'Professional insights', text: 'Working professionals report which skills and tools they actually use, and what beginners get wrong.' },
              { icon: UserRound, title: 'Your skills', text: 'You select the skills you have and rate your level: Beginner, Intermediate or Advanced.' },
            ].map(({ icon: Icon, title, text }) => (
              <div className="card" key={title}>
                <div className="icon-circle mb"><Icon size={18} /></div>
                <h3>{title}</h3>
                <p className="small muted" style={{ margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
          <div className="flow-arrow"><ArrowDown /></div>
          <div className="card" style={{ textAlign: 'center', background: 'var(--primary-50)', borderColor: 'var(--primary-100)' }}>
            <div className="row" style={{ justifyContent: 'center' }}><Target size={20} color="var(--primary)" /><h3 style={{ margin: 0, color: 'var(--primary-ink)' }}>Personalized skill priorities</h3></div>
            <p className="small" style={{ margin: '6px 0 0', color: 'var(--primary-ink)' }}>Ranked skills for your role · your gaps · a suggested learning order — each with the evidence behind it.</p>
          </div>
          <div className="mt" style={{ marginTop: 28 }}>
            <div className="tiny muted" style={{ textAlign: 'center', marginBottom: 8 }}>Data pipeline</div>
            <div className="pipeline">
              {PIPELINE.map((s, i) => (
                <span key={s} className="row" style={{ gap: 8 }}><span className="step">{s}</span>{i < PIPELINE.length - 1 && <ArrowRight size={14} color="var(--text-3)" />}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="page-header">
            <div>
              <div className="eyebrow">Supported career roles</div>
              <h2>16 roles across engineering, data, AI, infrastructure, security, product and design</h2>
            </div>
            <Link to="/roles" className="btn btn-secondary">View all roles <ArrowRight size={16} /></Link>
          </div>
          <div className="grid grid-4">
            {(data?.roles || []).map((r) => (
              <Link to={`/roles/${r.slug}`} key={r.slug} className="card hover" style={{ color: 'inherit', textDecoration: 'none', padding: 16 }}>
                <div className="tiny muted">{r.category}</div>
                <strong>{r.name}</strong>
                <div className="tiny muted" style={{ marginTop: 4 }}>{r.topSkills.slice(0, 3).join(' · ')}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container grid grid-3">
          <div className="card">
            <h3>Research status</h3>
            <p className="small muted">SkillLens is being validated. We show progress honestly instead of claiming results we do not have yet.</p>
            <ResearchStatus />
          </div>
          <div className="card">
            <div className="icon-circle mb"><MessageSquareHeart size={18} /></div>
            <h3>Working professional?</h3>
            <p className="small muted">Help students understand what work actually looks like. The survey takes 3–5 minutes.</p>
            <Link to="/contribute" className="btn btn-primary btn-sm">Share your insights</Link>
          </div>
          <div className="card">
            <div className="icon-circle mb"><ClipboardList size={18} /></div>
            <h3>Student?</h3>
            <p className="small muted">Tell us how you decide what to learn. Your answers validate whether this problem is real.</p>
            <Link to="/research/student-survey" className="btn btn-secondary btn-sm">Take the student survey</Link>
          </div>
        </div>
      </section>
    </>
  );
}
