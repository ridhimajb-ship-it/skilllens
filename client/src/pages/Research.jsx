import { Link } from 'react-router-dom';
import { ClipboardList, MessageSquareHeart, Database, Scale } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../utils/useApi.js';
import { DataBadge } from '../components/ui.jsx';
import ResearchStatus from '../components/ResearchStatus.jsx';
import { COMPETITORS } from '../utils/competitors.js';

export default function Research() {
  const { data: meta } = useApi(() => api.meta(), []);
  const w = meta?.algorithm?.weightsInUse || { industry: 0.5, professional: 0.35, beginner: 0.15 };

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Research & methodology</div>
          <h1>How SkillLens knows what it knows</h1>
          <p>SkillLens estimates role-specific skill priorities from available job-posting and professional data. This page explains the method, the current state of validation, and the limits.</p>
        </div>
      </div>

      <div className="grid grid-3 mb">
        <div className="card">
          <h3>Research status</h3>
          <ResearchStatus />
          <div className="row mt">
            <Link to="/research/student-survey" className="btn btn-primary btn-sm"><ClipboardList size={14} /> Student survey</Link>
            <Link to="/contribute" className="btn btn-secondary btn-sm"><MessageSquareHeart size={14} /> Professional survey</Link>
          </div>
        </div>
        <div className="card span-2">
          <h3><Database size={16} style={{ verticalAlign: -2 }} /> Where data comes from</h3>
          <p className="small muted">Every record carries an origin label so demo values can never be mistaken for findings.</p>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr><td><DataBadge origin="real" /></td><td className="small">Responses submitted through the live SkillLens surveys, or postings collected by the team with source and URL.</td></tr>
                <tr><td><DataBadge origin="imported" /></td><td className="small">CSV/JSON uploaded by the research team whose provenance has not been verified.</td></tr>
                <tr><td><DataBadge origin="demo" /></td><td className="small">Synthetic records generated from the initial hypothesis so the prototype works before data collection. Removable in one click.</td></tr>
                <tr><td><DataBadge origin="hypothesis" /></td><td className="small">The team&apos;s starting skill list for each role — shown without scores until data exists.</td></tr>
                <tr><td><DataBadge origin="illustrative" /></td><td className="small">Example values used in explanations, such as the landing-page preview.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card mb" id="algorithm">
        <h2><Scale size={20} style={{ verticalAlign: -3 }} /> The skill-ranking algorithm</h2>
        <p className="muted">A transparent formula built from measurable shares — not an opaque AI score.</p>
        <div className="formula">{`For role r and skill s:
  D = postings for r that mention s            / all postings for r          (industry demand)
  P = professionals in r who use s regularly   / all professionals in r      (professional usage)
  B = professionals in r naming s for beginners / all professionals in r     (beginner importance)

  Score(r, s) = 100 × (${w.industry}·D + ${w.professional}·P + ${w.beginner}·B) / (sum of weights for signals that have data)

  Tiers: Very High ≥ 80 · High 60–79 · Moderate 40–59 · Low 20–39 · Minimal < 20`}</div>
        <div className="grid grid-3 mt">
          <div><h3>Missing signals</h3><p className="small muted">If a role has postings but no professional responses, the score uses D only (and vice-versa). The UI always states how many postings and responses a score is based on.</p></div>
          <div><h3>Role specificity</h3><p className="small muted">D for this role ÷ (D for this role + average D in other roles). Reported next to each skill but not added to the score, because universal skills like Git can be both common and essential.</p></div>
          <div><h3>Confidence</h3><p className="small muted">Based on sample size only: High = 30+ postings and 5+ professionals; Medium = 10+ postings or 3+ professionals; otherwise Low.</p></div>
        </div>
        <h3 className="mt">Skill-gap engine</h3>
        <ul className="small muted">
          <li>Required skills: the role&apos;s top 15 skills with score ≥ 25.</li>
          <li>Expected level: score ≥ 75 → Advanced, ≥ 45 → Intermediate, otherwise Beginner (a stated assumption).</li>
          <li>Gap = expected level − your level; priority = score × gap ÷ 3; readiness = score-weighted share of expected proficiency you already have.</li>
          <li>Learning order follows priority, but prerequisites (e.g. Statistics before Machine Learning) are moved earlier.</li>
        </ul>
      </div>

      <div className="card mb">
        <h2>Competitor landscape</h2>
        <p className="muted small">Based on each platform&apos;s publicly described core offering. This is a positioning framework for the team to refine with its own research, not a claim about every feature a platform has.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Platform</th><th>What it provides</th><th>What it is not focused on</th><th>How SkillLens differs</th></tr></thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr key={c.name}><td><strong>{c.name}</strong></td><td className="small">{c.provides}</td><td className="small muted">{c.gap}</td><td className="small">{c.difference}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small mt"><strong>Positioning:</strong> existing platforms provide courses, networking, job listings, roadmaps or mentorship. SkillLens focuses on aggregating <em>industry requirements + professional usage + the student&apos;s skill profile</em> into role-specific skill priorities.</p>
      </div>

      <div className="card">
        <h2>Limitations</h2>
        <ul className="small muted" style={{ marginBottom: 0 }}>
          <li>Rankings reflect only the postings and responses collected; small or skewed samples (one city, one source, one season) produce skewed priorities.</li>
          <li>Skill extraction relies on a curated alias dictionary. New or unusual terms are reported as “unmapped” until an alias is added.</li>
          <li>A posting mentioning a skill does not tell us how deeply it is needed; expected levels are an explicit assumption.</li>
          <li>Self-rated proficiency is subjective.</li>
          <li>SkillLens does not guarantee employment and does not replace mentors, teachers or career counsellors.</li>
        </ul>
      </div>
    </div>
  );
}
