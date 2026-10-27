import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, ScanSearch, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ResearchStatus from './ResearchStatus.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  const links = [
    { to: '/roles', label: 'Career Roles' },
    { to: '/assess', label: 'Assess My Skills' },
    ...(user?.role === 'student' ? [{ to: '/dashboard', label: 'My Dashboard' }] : []),
    { to: '/contribute', label: 'For Professionals' },
    { to: '/research', label: 'Research' },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <>
      <header className={`nav ${open ? 'open' : ''}`}>
        <div className="container nav-inner">
          <Link to="/" className="brand" aria-label="SkillLens home">
            <span className="brand-mark"><ScanSearch size={17} /></span> SkillLens
          </Link>
          <button type="button" className="nav-toggle" aria-label="Toggle navigation" onClick={() => setOpen((o) => !o)}><Menu /></button>
          <nav className="nav-links" aria-label="Main">
            {links.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
          </nav>
          <div className="nav-right">
            {user ? (
              <>
                <span className="small muted">{user.name} · <span style={{ textTransform: 'capitalize' }}>{user.role}</span></span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={15} /> Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="container footer-inner">
          <div style={{ maxWidth: 420 }}>
            <div className="brand" style={{ fontSize: '1rem', marginBottom: 6 }}><span className="brand-mark"><ScanSearch size={15} /></span> SkillLens</div>
            <p className="small">A CPI research prototype. SkillLens <em>estimates</em> role-specific skill priorities from available job-posting and
              professional data. It does not guarantee employment and does not replace mentors.</p>
          </div>
          <div style={{ minWidth: 280 }}>
            <div className="label" style={{ marginBottom: 8 }}>Research status</div>
            <ResearchStatus compact />
          </div>
        </div>
      </footer>
    </>
  );
}
