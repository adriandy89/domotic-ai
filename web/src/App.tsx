import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './components/layout/AuthLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import RulesPage from './pages/RulesPage';
import RuleFormPage from './pages/RuleFormPage';
import AccessPage from './pages/AccessPage';
import HomesPage from './pages/HomesPage';
import HomeMapPage from './pages/HomeMapPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import ProtectedRoute from './ProtectedRoute';

// Public Route wrapper to redirect authenticated users to dashboard
import { useAuthStore } from './store/useAuthStore';
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
        </Route>

        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/homes" element={<HomesPage />} />
            <Route path="/homes/:id" element={<HomeMapPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/rules/new" element={<RuleFormPage />} />
            <Route path="/rules/edit/:id" element={<RuleFormPage />} />
            <Route path="/access" element={<AccessPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
