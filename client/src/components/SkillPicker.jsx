import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { LEVELS } from '../utils/useApi.js';

export function LevelSelector({ value, onChange, name }) {
  return (
    <div className="level-group" role="radiogroup" aria-label={`Proficiency for ${name}`}>
      {[1, 2, 3].map((lvl) => (
        <button key={lvl} type="button" role="radio" aria-checked={value === lvl}
          className={value === lvl ? 'on' : ''} onClick={() => onChange(lvl)}>
          {LEVELS[lvl]}
        </button>
      ))}
    </div>
  );
}

/**
 * Select skills, rate proficiency and add custom skills.
 * @param {Array<{id,name,category}>} catalog all taxonomy skills
 * @param {Array<{skillId?, name, level}>} value selected skills
 * @param {string[]} suggestions skill names to offer as quick-add (e.g. the role's top skills)
 */
export default function SkillPicker({ catalog, value, onChange, suggestions = [] }) {
  const [query, setQuery] = useState('');
  const selectedNames = useMemo(() => new Set(value.map((v) => v.name.toLowerCase())), [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((s) => s.name.toLowerCase().includes(q) || s.aliases?.some((a) => a.toLowerCase().includes(q)))
      .filter((s) => !selectedNames.has(s.name.toLowerCase())).slice(0, 8);
  }, [catalog, query, selectedNames]);

  const exact = catalog.find((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  const add = (skill) => {
    if (selectedNames.has(skill.name.toLowerCase())) return;
    onChange([...value, { skillId: skill.id ?? undefined, name: skill.name, category: skill.category || 'Custom', level: 1 }]);
    setQuery('');
  };
  const addCustom = () => {
    const name = query.trim();
    if (!name || selectedNames.has(name.toLowerCase())) return;
    onChange([...value, { name, category: 'Custom', level: 1, custom: true }]);
    setQuery('');
  };
  const setLevel = (name, level) => onChange(value.map((v) => (v.name === name ? { ...v, level } : v)));
  const remove = (name) => onChange(value.filter((v) => v.name !== name));

  const quick = suggestions.filter((n) => !selectedNames.has(n.toLowerCase())).slice(0, 14);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
        <input className="input" style={{ paddingLeft: 36 }} placeholder="Search skills or tools (e.g. Python, Postgres, Figma)…"
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search skills"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[0]) add(matches[0]);
              else if (query.trim()) addCustom();
            }
          }} />
        {query.trim() && (
          <div className="card" style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: 46, padding: 6, boxShadow: 'var(--shadow)' }} role="listbox">
            {matches.map((s) => (
              <button key={s.id} type="button" role="option" aria-selected="false" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => add(s)}>
                <span>{s.name}</span><span className="tiny muted">{s.category}</span>
              </button>
            ))}
            {!exact && (
              <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={addCustom}>
                <Plus size={15} /> Add “{query.trim()}” as a custom skill
              </button>
            )}
          </div>
        )}
      </div>

      {quick.length > 0 && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>Quick add — top skills for this role</div>
          <div className="suggest">
            {quick.map((n) => {
              const s = catalog.find((c) => c.name === n) || { name: n };
              return <button type="button" key={n} onClick={() => add(s)}><Plus size={12} /> {n}</button>;
            })}
          </div>
        </div>
      )}

      {value.length === 0 ? (
        <div className="empty small" style={{ padding: 18 }}>No skills added yet. It is fine to start with a few — you can always come back.</div>
      ) : (
        <div className="stack" style={{ gap: 8 }} aria-label="Selected skills">
          {value.map((v) => (
            <div className="skill-row" key={v.name}>
              <div>
                <strong style={{ fontWeight: 600 }}>{v.name}</strong>
                <span className="tiny muted" style={{ marginLeft: 8 }}>{v.custom || v.category === 'Custom' ? 'Custom skill' : v.category}</span>
              </div>
              <LevelSelector value={v.level} onChange={(lvl) => setLevel(v.name, lvl)} name={v.name} />
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${v.name}`} onClick={() => remove(v.name)}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
