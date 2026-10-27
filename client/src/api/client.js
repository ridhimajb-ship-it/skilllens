/** Thin REST client for the SkillLens API. All requests go through /api (proxied by Vite in dev). */
const BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'skilllens_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: session lasts for this tab only */ }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the SkillLens API. Is the server running (npm run dev)?');
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  return data;
}

/** Download a protected file (CSV export) using the auth header. */
export async function download(path, filename) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  del: (p, b) => request('DELETE', p, b),

  // auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (payload) => request('POST', '/auth/register', payload),
  me: () => request('GET', '/auth/me'),

  // public data
  roles: () => request('GET', '/roles'),
  role: (slug) => request('GET', `/roles/${slug}`),
  roleAnalysis: (slug) => request('GET', `/roles/${slug}/skill-analysis`),
  skills: (params = {}) => request('GET', `/skills${qs(params)}`),
  normalize: (terms, text) => request('POST', '/skills/normalize', { terms, text }),
  researchStatus: () => request('GET', '/research-status'),
  meta: () => request('GET', '/meta'),
  surveyOptions: () => request('GET', '/surveys/options'),
  computeGap: (role, skills) => request('POST', '/skill-gap/compute', { role, skills }),

  // student
  studentProfile: () => request('GET', '/student/profile'),
  saveProfile: (payload) => request('POST', '/student/profile', payload),
  saveSkills: (skills) => request('POST', '/student/skills', { skills }),
  skillGap: (role) => request('GET', `/student/skill-gap${qs({ role })}`),
  dashboard: () => request('GET', '/student/dashboard'),

  // surveys
  submitStudentValidation: (payload) => request('POST', '/student-validation', payload),
  submitProfessional: (payload) => request('POST', '/professional-survey', payload),

  // admin
  adminAnalytics: () => request('GET', '/admin/analytics'),
  jobPostings: (params) => request('GET', `/admin/job-postings${qs(params)}`),
  professionalResponses: (params = {}) => request('GET', `/admin/professional-responses${qs(params)}`),
  studentResponses: () => request('GET', '/admin/student-validation'),
  previewImport: (kind, payload) => request('POST', `/admin/import/${kind}/preview`, payload),
  runImport: (kind, payload) => request('POST', `/admin/import/${kind}`, payload),
  analyze: (payload) => request('POST', '/admin/analyze', payload),
  analysisRuns: () => request('GET', '/admin/analysis-runs'),
  addAlias: (skillId, alias) => request('POST', `/admin/skills/${skillId}/aliases`, { alias }),
  setResearchDecision: (status, note) => request('PUT', '/admin/research-status', { status, note }),
  deleteDemoData: () => request('DELETE', '/admin/demo-data', { confirm: 'DELETE DEMO DATA' }),
};
