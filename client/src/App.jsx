import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import RoleExplorer from './pages/RoleExplorer.jsx';
import RoleDetail from './pages/RoleDetail.jsx';
import Assessment from './pages/Assessment.jsx';
import GapAnalysis from './pages/GapAnalysis.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ProfessionalSurvey from './pages/ProfessionalSurvey.jsx';
import StudentSurvey from './pages/StudentSurvey.jsx';
import Research from './pages/Research.jsx';
import { Login, Register } from './pages/Auth.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx';
import AdminData from './pages/admin/AdminData.jsx';
import NotFound from './pages/NotFound.jsx';

export function RequireRole({ role, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (role && user.role !== role) {
    return (
      <div className="container page">
        <div className="card"><h2>Not available for this account</h2><p className="muted">This page is for {role} accounts. You are signed in as a {user.role}.</p></div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="roles" element={<RoleExplorer />} />
        <Route path="roles/:slug" element={<RoleDetail />} />
        <Route path="assess" element={<Assessment />} />
        <Route path="gap" element={<GapAnalysis />} />
        <Route path="dashboard" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
        <Route path="contribute" element={<ProfessionalSurvey />} />
        <Route path="research" element={<Research />} />
        <Route path="research/student-survey" element={<StudentSurvey />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="admin/analytics" element={<RequireRole role="admin"><AdminAnalytics /></RequireRole>} />
        <Route path="admin/data" element={<RequireRole role="admin"><AdminData /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
