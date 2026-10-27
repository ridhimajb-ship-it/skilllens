/**
 * Competitor positioning framework (see RESEARCH.md). Descriptions summarise each platform's publicly
 * described core offering at a high level; the team should verify and extend them during research.
 */
export const COMPETITORS = [
  {
    name: 'LinkedIn',
    provides: 'Professional networking, job listings, and learning content (LinkedIn Learning).',
    gap: 'A per-role, ranked view of which skills to prioritise, combined with the student’s own skill gaps.',
    difference: 'Aggregates posting demand with professional-reported usage and turns it into an ordered learning plan.',
  },
  {
    name: 'Glassdoor',
    provides: 'Company reviews, salary information, interview experiences and job listings.',
    gap: 'Structured skill requirements per role or guidance on what to learn first.',
    difference: 'Focuses on skills rather than employers, and maps them to an individual student profile.',
  },
  {
    name: 'ADPList',
    provides: 'Free one-to-one mentorship sessions with volunteer mentors.',
    gap: 'Aggregated, comparable data across many professionals; advice depends on the individual mentor.',
    difference: 'Collects short structured input from many professionals and aggregates it, complementing (not replacing) mentors.',
  },
  {
    name: 'MentorCruise',
    provides: 'Paid long-term mentorship with industry professionals.',
    gap: 'Free, data-backed skill prioritisation at scale.',
    difference: 'Provides a transparent, evidence-based starting point students can bring to a mentor.',
  },
  {
    name: 'roadmap.sh',
    provides: 'Community-curated learning roadmaps for developer roles.',
    gap: 'Linking each roadmap item to measured job-posting frequency, or personalising it to a student’s current level.',
    difference: 'Ranks skills from posting and professional data and highlights the student’s specific gaps.',
  },
  {
    name: 'Coursera',
    provides: 'Courses, specialisations and professional certificates from universities and companies.',
    gap: 'Deciding which skills matter most for a specific role before choosing courses.',
    difference: 'Answers “what should I learn first?” — the step before choosing where to learn it.',
  },
];
