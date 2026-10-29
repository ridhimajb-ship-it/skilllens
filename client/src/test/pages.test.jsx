import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { dashboard } from './fixtures.js';

vi.mock('../api/client.js', () => ({
  api: {
    dashboard: vi.fn(),
    researchStatus: vi.fn(),
    me: vi.fn(),
  },
  getToken: () => null,
  setToken: () => {},
  download: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Asha Student', role: 'student' }, ready: true }),
}));

const { api } = await import('../api/client.js');
const { default: StudentDashboard } = await import('../pages/StudentDashboard.jsx');
const { default: ResearchStatus } = await import('../components/ResearchStatus.jsx');

describe('student dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders every dashboard section from API data', async () => {
    api.dashboard.mockResolvedValue(dashboard);
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    expect(await screen.findByText('Hi Asha, here is where you stand')).toBeInTheDocument();
    for (const heading of ['Career goal', 'Skill readiness', 'Recommended priorities', 'Top industry skills', 'Your skills', 'Industry vs you', 'Biggest skill gaps']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getByText('Data Scientist', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/12 pts since last check/)).toBeInTheDocument();
    expect(screen.getByText('Jupyter')).toBeInTheDocument();
    expect(screen.queryByText(/Demo data — replace with validated research data/)).toBeNull();
  });

  test('prompts for setup when no goal is chosen', async () => {
    api.dashboard.mockResolvedValue({ profile: null, skills: [], needsSetup: true });
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    expect(await screen.findByText('Start my assessment')).toBeInTheDocument();
  });

  test('shows a readable error when the API fails', async () => {
    api.dashboard.mockRejectedValue(new Error('Cannot reach the SkillLens API.'));
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the SkillLens API.');
  });
});

describe('research status', () => {
  test('reports pending validation honestly', () => {
    const data = {
      problemValidation: { status: 'Pending', responses: 0, target: 50 },
      professionalData: { status: 'In Progress', responses: 4, target: 15 },
      jobMarketData: { status: 'Pending', postings: 0 },
      usingDemoData: true,
    };
    render(<ResearchStatus data={data} />);
    expect(screen.getByText('Problem validation').parentElement).toHaveTextContent('Pending');
    expect(screen.getByText('Professional data').parentElement).toHaveTextContent('4/15');
    expect(screen.getByText(/Demo records are excluded/)).toBeInTheDocument();
  });
});
