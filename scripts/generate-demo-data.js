/**
 * Generates the SYNTHETIC demo dataset in data/demo/.
 *
 * IMPORTANT: this data is generated from the team's initial hypothesis taxonomy (roles.json) using a
 * seeded random generator. Rankings computed from it therefore mirror the hypothesis — they are NOT
 * market findings. The demo exists only so the prototype works end-to-end before real data is collected.
 *
 * Usage: node scripts/generate-demo-data.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDoc = JSON.parse(fs.readFileSync(path.join(root, 'data/taxonomy/skills.json'), 'utf8'));
const rolesDoc = JSON.parse(fs.readFileSync(path.join(root, 'data/taxonomy/roles.json'), 'utf8'));
const outDir = path.join(root, 'data/demo');

// Mulberry32: tiny deterministic PRNG so the demo dataset is reproducible.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261027);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sample = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const chance = (p) => rand() < p;

const stop = new Set(skillsDoc.textExtractionStopAliases);
const skillByName = new Map(skillsDoc.skills.map((s) => [s.name, s]));

/** Write a skill the way a real posting might: canonical name or a recognisable alias. */
function phrase(name) {
  const s = skillByName.get(name);
  const usable = (s.aliases || []).filter((a) => a.length > 3 && !stop.has(a.toLowerCase()));
  if (usable.length && chance(0.3)) return pick(usable).replace(/\b\w/g, (c) => c.toUpperCase());
  return name;
}

// Skills outside the hypothesis lists that may appear in postings (tests "discovered skill" detection).
const EXTRAS = {
  'data-scientist': ['Jupyter', 'Pandas', 'NumPy', 'Scikit-learn'],
  'data-analyst': ['Jupyter', 'Pandas', 'Snowflake'],
  'machine-learning-engineer': ['Jupyter', 'Hugging Face', 'Data Engineering', 'Kubernetes', 'Docker'],
  'ai-engineer': ['LangChain', 'Hugging Face', 'Docker', 'Generative AI'],
  'devops-engineer': ['GitHub Actions', 'Grafana'],
  'cloud-engineer': ['GitHub Actions', 'Bash/Shell Scripting'],
  'backend-developer': ['Redis', 'CI/CD'],
  'full-stack-developer': ['Next.js', 'Redis'],
  'cybersecurity-engineer': ['Wireshark', 'Linux'],
  'product-manager': ['Confluence', 'Excel'],
  'software-engineer': ['Linux', 'Microservices'],
  'software-developer': ['Linux', 'Spring Boot'],
  'frontend-developer': ['Figma'],
  'mobile-app-developer': ['CI/CD'],
  'ui-ux-designer': ['Accessibility'].filter((n) => skillByName.has(n)),
  'business-analyst': ['Confluence'],
};

const TITLE_PREFIX = ['', '', 'Junior ', 'Associate ', 'Senior ', 'Graduate '];
const TITLE_SUFFIX = ['', '', ' I', ' II', ' (Entry Level)'];
const LOCATIONS = ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Gurugram', 'Mumbai', 'Noida', 'Remote (India)'];
const EDUCATION = ["Bachelor's degree in Computer Science or related field", "B.Tech/B.E. or equivalent", "Bachelor's or Master's degree in a quantitative field", null];
const PERKS = ['collaborative team', 'mentorship programme', 'hybrid working', 'learning budget'];

const jobs = [];
let companyNo = 1;
for (const role of rolesDoc.roles) {
  const perRole = 9;
  for (let i = 0; i < perRole; i += 1) {
    const chosen = [
      ...role.core.filter(() => chance(0.78)),
      ...role.secondary.filter(() => chance(0.33)),
      ...(EXTRAS[role.slug] || []).filter(() => chance(0.3)),
    ];
    if (chosen.length < 4) chosen.push(...sample(role.core, 3));
    const unique = [...new Set(chosen)];
    const required = unique.slice(0, Math.ceil(unique.length * 0.7));
    const nice = unique.slice(required.length);
    const years = pick([0, 0, 1, 2, 3, 5]);
    const title = `${pick(TITLE_PREFIX)}${role.name}${pick(TITLE_SUFFIX)}`.trim();
    const listInColumn = chance(0.5);
    const description = [
      '[DEMO DATA - synthetic posting generated for the SkillLens prototype; not a real job.]',
      `We are looking for ${/^[AEIOU]/i.test(title) ? "an" : "a"} ${title} to join a ${pick(PERKS)} working on customer-facing products.`,
      `Requirements: ${required.map(phrase).join(', ')}.`,
      nice.length ? `Nice to have: ${nice.map(phrase).join(', ')}.` : '',
      years === 0 ? 'Freshers and entry-level candidates are welcome.' : `Experience: ${years}+ years.`,
    ].filter(Boolean).join(' ');
    jobs.push({
      company: `Demo Company ${String(companyNo).padStart(3, '0')}`,
      job_title: title,
      role_category: chance(0.5) ? role.name : '',
      location: pick(LOCATIONS),
      posting_date: `2026-${String(7 + Math.floor(rand() * 4)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      source: 'DEMO (synthetic)',
      url: '',
      description,
      skills: listInColumn ? unique.map(phrase).join('; ') : '',
      experience: years === 0 ? 'Entry level / fresher' : `${years}+ years`,
      education: pick(EDUCATION) || '',
      certifications: role.slug.includes('cloud') && chance(0.5) ? 'AWS Certified Solutions Architect (preferred)' : '',
    });
    companyNo += 1;
  }
}

// Deliberately imperfect rows so the data-quality monitor has something to show.
jobs.push({ ...jobs[0] }); // exact duplicate -> skipped on import
jobs.push({
  company: 'Demo Company 999', job_title: 'Operations Associate', role_category: '', location: 'Pune',
  posting_date: '2026-09-15', source: 'DEMO (synthetic)', url: '',
  description: '[DEMO DATA - synthetic posting.] Coordinate vendor schedules. Requirements: Excel, Communication, Quantum Basket Weaving.',
  skills: 'Excel; Communication; Quantum Basket Weaving', experience: '1+ years', education: '', certifications: '',
});

const columns = ['company', 'job_title', 'role_category', 'location', 'posting_date', 'source', 'url', 'description', 'skills', 'experience', 'education', 'certifications'];
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [columns.join(','), ...jobs.map((j) => columns.map((c) => csvCell(j[c])).join(','))].join('\n');

/* --------------------------------------------------------------- professional responses */

const FAMILY = {
  'software-engineer': 'eng', 'software-developer': 'eng', 'full-stack-developer': 'eng', 'frontend-developer': 'eng',
  'backend-developer': 'eng', 'mobile-app-developer': 'eng', 'data-analyst': 'data', 'data-scientist': 'data',
  'machine-learning-engineer': 'ai', 'ai-engineer': 'ai', 'devops-engineer': 'infra', 'cloud-engineer': 'infra',
  'cybersecurity-engineer': 'sec', 'product-manager': 'biz', 'business-analyst': 'biz', 'ui-ux-designer': 'design',
};
const TEXT = {
  eng: {
    mistakes: ['Collecting frameworks without understanding fundamentals such as HTTP, data structures and debugging.', 'Not reading other people\'s code or writing tests before shipping.', 'Avoiding Git workflows until the first job forces them.'],
    wish: ['Reading production code and writing tests earlier.', 'How to debug systematically instead of guessing.'],
    reality: ['Most of the day is reading existing code, reviewing pull requests and fixing bugs, not greenfield building.'],
  },
  data: {
    mistakes: ['Jumping to machine learning before being comfortable with SQL and basic statistics.', 'Spending little time on data cleaning, which is most of the real work.', 'Making charts without a clear question or audience.'],
    wish: ['SQL joins and window functions, much earlier.', 'How to explain results to non-technical stakeholders.'],
    reality: ['A large share of time goes to finding, cleaning and validating data before any modelling happens.'],
  },
  ai: {
    mistakes: ['Training models without a proper evaluation set or baseline.', 'Ignoring deployment and monitoring until the end.', 'Treating notebooks as production code.'],
    wish: ['Software engineering habits: packaging, testing, versioning.', 'How to evaluate model and LLM output systematically.'],
    reality: ['Much of the job is data pipelines, evaluation and serving, with comparatively little time spent inventing new models.'],
  },
  infra: {
    mistakes: ['Learning tool names without understanding Linux and networking basics.', 'Clicking through cloud consoles instead of using infrastructure as code.', 'Ignoring cost and security until something breaks.'],
    wish: ['Linux, networking and shell scripting fundamentals.', 'Reading logs and metrics during incidents.'],
    reality: ['A lot of automation, on-call troubleshooting and documenting how systems fit together.'],
  },
  sec: {
    mistakes: ['Focusing only on offensive tools and skipping networking fundamentals.', 'Not learning to write clear incident reports.', 'Ignoring governance and compliance as "boring".'],
    wish: ['Networking and log analysis before tools.', 'How risk and compliance decisions are made in a business.'],
    reality: ['Monitoring alerts, triaging, writing reports and working with other teams on remediation.'],
  },
  biz: {
    mistakes: ['Writing requirements without talking to actual users or stakeholders.', 'Avoiding data — not being able to pull basic numbers with SQL or Excel.', 'Trying to say yes to every request instead of prioritizing.'],
    wish: ['Basic SQL and spreadsheet analysis.', 'Structured prioritization and saying no with evidence.'],
    reality: ['Many meetings: aligning stakeholders, clarifying scope, writing and refining documents.'],
  },
  design: {
    mistakes: ['Polishing visuals before validating the problem with users.', 'Not building or using a design system.', 'Presenting designs without explaining the reasoning.'],
    wish: ['Usability testing with real users early and often.', 'Enough HTML/CSS to understand engineering constraints.'],
    reality: ['Research, iteration and many review conversations; high-fidelity screens are a small part of the work.'],
  },
};
const INDUSTRIES = ['IT services / consulting', 'Product / SaaS', 'Finance / Banking / FinTech', 'E-commerce / Retail', 'Healthcare'];
const BANDS = ['1-3 years', '3-5 years', '5-10 years', '10+ years'];
const toolTypes = new Set(['tool', 'platform', 'library']);

const responses = [];
for (const role of rolesDoc.roles) {
  const t = TEXT[FAMILY[role.slug]];
  for (let i = 0; i < 3; i += 1) {
    const used = [
      ...role.core.filter(() => chance(0.8)),
      ...role.secondary.filter(() => chance(0.3)),
      ...(EXTRAS[role.slug] || []).filter(() => chance(0.4)),
    ];
    const unique = [...new Set(used)];
    responses.push({
      role: role.slug,
      industry: pick(INDUSTRIES),
      experienceBand: pick(BANDS),
      skillsUsed: unique.filter((n) => !toolTypes.has(skillByName.get(n).type)),
      toolsUsed: unique.filter((n) => toolTypes.has(skillByName.get(n).type)),
      beginnerSkills: sample(role.core, 3),
      overemphasizedSkills: sample(role.secondary, 1),
      beginnerMistakes: `[Demo] ${t.mistakes[i % t.mistakes.length]}`,
      wishLearnedEarlier: `[Demo] ${pick(t.wish)}`,
      workReality: `[Demo] ${pick(t.reality)}`,
      willingToContribute: pick(['Yes, happy to', 'Maybe occasionally']),
      motivation: sample(['Help students prepare better', 'Share what the job really involves', 'Give back to my college / community'], 2),
    });
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'job_postings_demo.csv'), `${csv}\n`);
fs.writeFileSync(path.join(outDir, 'professional_responses_demo.json'), `${JSON.stringify({
  _notice: 'DEMO DATA — synthetic responses generated from the initial hypothesis taxonomy for the SkillLens prototype. These are NOT real professionals. Replace with validated research data.',
  generatedBy: 'scripts/generate-demo-data.js',
  responses,
}, null, 2)}\n`);
console.log(`Wrote ${jobs.length} demo job postings and ${responses.length} demo professional responses to data/demo/`);
