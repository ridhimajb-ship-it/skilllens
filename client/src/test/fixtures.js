// Small hand-written fixtures for component tests (not research data).
export const catalog = [
  { id: 1, name: 'Python', category: 'Programming Languages', aliases: ['python 3'] },
  { id: 2, name: 'SQL', category: 'Databases', aliases: ['structured query language'] },
  { id: 3, name: 'PostgreSQL', category: 'Databases', aliases: ['postgres'] },
  { id: 4, name: 'Statistics', category: 'Statistics & Math', aliases: [] },
];

const row = (skillId, name, score, requiredLevel, studentLevel, priority, priorityValue) => ({
  skillId, name, category: 'Test', type: 'concept', industryScore: score, industryTier: score >= 80 ? 'Very High' : 'High',
  requiredLevel, requiredLabel: ['Not yet', 'Beginner', 'Intermediate', 'Advanced'][requiredLevel],
  studentLevel, studentLabel: ['Not yet', 'Beginner', 'Intermediate', 'Advanced'][studentLevel],
  gap: Math.max(0, requiredLevel - studentLevel), gapLabel: ['None', 'Low', 'Medium', 'High'][Math.max(0, requiredLevel - studentLevel)],
  priority, priorityValue, reason: 'in 80% of postings; you: Beginner, expected: Advanced', prerequisites: [],
});

export const gapResult = {
  role: { id: 7, slug: 'data-scientist', name: 'Data Scientist' },
  basis: 'data',
  dataBasis: { runId: 1, runIncludesDemo: true, postingTotal: 9, professionalTotal: 3, confidence: 'medium' },
  readiness: 42,
  rows: [row(1, 'Python', 90, 3, 3, 'Met', 0), row(2, 'SQL', 85, 3, 1, 'Very High', 57), row(4, 'Statistics', 70, 2, 0, 'High', 47)],
  strengths: [row(1, 'Python', 90, 3, 3, 'Met', 0)],
  biggestGaps: [row(2, 'SQL', 85, 3, 1, 'Very High', 57), row(4, 'Statistics', 70, 2, 0, 'High', 47)],
  highPriority: [row(2, 'SQL', 85, 3, 1, 'Very High', 57), row(4, 'Statistics', 70, 2, 0, 'High', 47)],
  learningOrder: [
    { step: 1, skillId: 2, name: 'SQL', priority: 'Very High', priorityValue: 57, from: 'Beginner', to: 'Advanced', note: null },
    { step: 2, skillId: 4, name: 'Statistics', priority: 'High', priorityValue: 47, from: 'Not yet', to: 'Intermediate', note: null },
  ],
  otherSkills: [{ skillId: null, name: 'Excel', level: 2 }],
  counts: { required: 3, met: 1, gaps: 2, partial: 1 },
  method: { requiredSkills: 'Top 15', requiredLevel: 'bands', priority: 'score x gap / 3', readiness: 'weighted' },
};

export const dashboard = {
  profile: { target_role_slug: 'data-scientist', target_role_name: 'Data Scientist' },
  skills: [{ skillId: 1, name: 'Python', category: 'Programming Languages', level: 3 }, { skillId: 2, name: 'SQL', category: 'Databases', level: 1 }],
  needsSetup: false,
  gap: gapResult,
  roleAnalysis: {
    dataBasis: { basis: 'data', postingTotal: 9, professionalTotal: 3, confidence: 'medium', containsDemo: true, runIncludesDemo: true },
    topSkills: [
      { name: 'Python', score: 90, industryDemand: 0.8 },
      { name: 'SQL', score: 85, industryDemand: 0.7 },
    ],
    tools: [{ name: 'Jupyter', professionalUsage: 0.67, industryDemand: 0.4, category: 'Data & Analytics' }],
    professionalInsights: { count: 3, beginnerMistakes: [{ text: '[Demo] Skipping SQL.', origin: 'demo' }] },
  },
  history: [{ readiness: 30, created_at: '2026-10-01' }, { readiness: 42, created_at: '2026-10-20' }],
};

export const roleCard = {
  slug: 'data-scientist', name: 'Data Scientist', category: 'Data', description: 'Models data.', basis: 'data',
  topSkills: ['Python', 'SQL'], topTools: ['Jupyter'], skillCount: 22, postingCount: 9, demoPostingCount: 9,
  professionalCount: 3, datasetShare: 1, confidence: 'medium',
};
