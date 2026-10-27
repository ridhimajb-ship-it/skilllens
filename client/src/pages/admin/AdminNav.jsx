import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Database } from 'lucide-react';

export default function AdminNav() {
  const items = [
    { to: '/admin', label: 'Overview & validation', icon: LayoutDashboard, end: true },
    { to: '/admin/analytics', label: 'Skill analytics', icon: BarChart3 },
    { to: '/admin/data', label: 'Data management', icon: Database },
  ];
  return (
    <div className="tabs" role="navigation" aria-label="Admin sections">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <Icon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{label}
        </NavLink>
      ))}
    </div>
  );
}
