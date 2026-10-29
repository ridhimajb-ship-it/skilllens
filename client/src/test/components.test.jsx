import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataBadge, ScoreBars, Tier, Priority } from '../components/ui.jsx';
import SkillPicker from '../components/SkillPicker.jsx';
import { RoleCard } from '../pages/RoleExplorer.jsx';
import { GapReport } from '../pages/GapAnalysis.jsx';
import { catalog, gapResult, roleCard } from './fixtures.js';

describe('provenance labels', () => {
  test('DataBadge names each data origin', () => {
    render(<><DataBadge origin="demo" /><DataBadge origin="real" /><DataBadge origin="illustrative" /></>);
    expect(screen.getByText('Demo data')).toBeInTheDocument();
    expect(screen.getByText('Real data')).toBeInTheDocument();
    expect(screen.getByText('Illustrative')).toBeInTheDocument();
  });

  test('score bars print every value as text', () => {
    render(<ScoreBars items={[{ label: 'Python', value: 91.6 }, { label: 'SQL', value: 70 }]} />);
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('tier and priority pills', () => {
    render(<><Tier tier="Very High" /><Priority value="Met" /></>);
    expect(screen.getByText('Very High')).toHaveClass('tier-very-high');
    expect(screen.getByText('Met')).toHaveClass('prio-met');
  });
});

describe('skill selection', () => {
  function Harness({ onChange }) {
    const [value, setValue] = useState([]);
    return <SkillPicker catalog={catalog} value={value} suggestions={['SQL']} onChange={(v) => { setValue(v); onChange?.(v); }} />;
  }

  test('search by alias, add, rate and remove a skill', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByLabelText('Search skills'), 'postgres');
    await user.click(screen.getByRole('option', { name: /PostgreSQL/ }));
    const selected = screen.getByLabelText('Selected skills');
    expect(within(selected).getByText('PostgreSQL')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'PostgreSQL', level: 3, skillId: 3 })]);

    await user.click(screen.getByRole('button', { name: 'Remove PostgreSQL' }));
    expect(screen.queryByLabelText('Selected skills')).not.toBeInTheDocument();
  });

  test('quick-add suggestions and custom skills', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /SQL/ }));
    await user.type(screen.getByLabelText('Search skills'), 'Basket weaving{Enter}');
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.map((s) => s.name)).toEqual(['SQL', 'Basket weaving']);
    expect(last[1]).toMatchObject({ custom: true, level: 1 });
    expect(screen.getByText('Custom skill')).toBeInTheDocument();
  });
});

describe('role explorer', () => {
  test('role card shows skills, tools, sample size and demo label', () => {
    render(<MemoryRouter><RoleCard role={roleCard} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Data Scientist' })).toBeInTheDocument();
    expect(screen.getByText('Jupyter')).toBeInTheDocument();
    expect(screen.getByText(/9 postings analysed/)).toBeInTheDocument();
    expect(screen.getByText('Demo data')).toBeInTheDocument();
    expect(screen.getByTestId('role-card')).toHaveAttribute('href', '/roles/data-scientist');
  });
});

describe('gap report', () => {
  test('renders readiness, strengths, priorities, learning order and the gap table', () => {
    render(<MemoryRouter><GapReport result={gapResult} /></MemoryRouter>);
    expect(screen.getByLabelText('42% ready')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 required skills/)).toBeInTheDocument();
    const order = screen.getByLabelText('Suggested learning order');
    expect(within(order).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('SQL'), expect.stringContaining('Statistics'),
    ]);
    const table = screen.getByLabelText('Skill gap table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText(/Also in your profile/).parentElement).toHaveTextContent('Excel');
    expect(screen.queryByText(/Demo data — replace with validated research data/)).toBeNull();
  });
});
