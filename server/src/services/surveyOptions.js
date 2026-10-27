/**
 * Answer options for the two research surveys. Served to the client via GET /api/surveys/options
 * so the forms, validation and analytics always use the same vocabulary.
 */
export const STUDENT_VALIDATION_OPTIONS = {
  studyYear: ['1st year', '2nd year', '3rd year', '4th year', 'Postgraduate', 'Recent graduate', 'Other'],
  decideMethods: [
    'YouTube / online videos', 'Seniors or alumni', 'Friends / peers', 'Teachers / professors', 'Job postings',
    'Online roadmaps (e.g. roadmap.sh)', 'Course platforms (Coursera, Udemy)', 'LinkedIn posts / influencers',
    'AI chatbots', 'College placement cell', "I don't have a method",
  ],
  learnedNotUseful: ['Yes, more than once', 'Yes, once', 'No', 'Not sure yet'],
  confusingPart: [
    'Too many skills listed for one role', "Don't know what to learn first", 'Conflicting advice from different sources',
    "Can't tell which skills companies actually need", "Don't know my current level", 'Too many courses to choose from', 'Other',
  ],
  sourceCount: ['1', '2-3', '4-5', '6 or more'],
  conflictingAdvice: ['Often', 'Sometimes', 'Rarely', 'Never'],
  trustedSources: [
    'Working professionals', 'Seniors / alumni', 'Teachers / professors', 'Job postings', 'YouTube creators',
    'Online roadmaps', 'Course platforms', 'AI chatbots', 'Friends / peers', 'Placement cell',
  ],
  wouldUsePlatform: ['Definitely', 'Probably', 'Not sure', 'Probably not', 'Definitely not'],
  gapViewHelpful: ['Very helpful', 'Somewhat helpful', 'Not very helpful', 'Not helpful at all'],
};

export const PROFESSIONAL_OPTIONS = {
  industry: [
    'IT services / consulting', 'Product / SaaS', 'Finance / Banking / FinTech', 'E-commerce / Retail', 'Healthcare',
    'Education / EdTech', 'Manufacturing', 'Government / Public sector', 'Startup (early stage)', 'Other',
  ],
  experienceBand: ['0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years'],
  willingToContribute: ['Yes, happy to', 'Maybe occasionally', 'No'],
  motivation: [
    'Help students prepare better', 'Give back to my college / community', 'Improve the quality of hiring',
    'Share what the job really involves', 'Networking / visibility', 'Other',
  ],
};

/** Representative years for each experience band (used for averages). */
export const EXPERIENCE_BAND_YEARS = { '0-1 years': 0.5, '1-3 years': 2, '3-5 years': 4, '5-10 years': 7.5, '10+ years': 12 };

export function bandForYears(years) {
  if (years === null || years === undefined || Number.isNaN(years)) return null;
  if (years < 1) return '0-1 years';
  if (years < 3) return '1-3 years';
  if (years < 5) return '3-5 years';
  if (years < 10) return '5-10 years';
  return '10+ years';
}

export const LEVELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
