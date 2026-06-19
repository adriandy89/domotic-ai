import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import AuthLayout from './components/layout/AuthLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import ReportsLayout from './components/reports/ReportsLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import RulesPage from './pages/RulesPage';
import RuleFormPage from './pages/RuleFormPage';
import SchedulesPage from './pages/SchedulesPage';
import ScheduleFormPage from './pages/ScheduleFormPage';
import AccessPage from './pages/AccessPage';
import HomesPage from './pages/HomesPage';
import HomeMapPage from './pages/HomeMapPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import EnergyReportPage from './pages/reports/EnergyReportPage';
import ClimateReportPage from './pages/reports/ClimateReportPage';
import SecurityReportPage from './pages/reports/SecurityReportPage';
import DevicesHealthReportPage from './pages/reports/DevicesHealthReportPage';
import AutomationsReportPage from './pages/reports/AutomationsReportPage';
import AiUsageReportPage from './pages/reports/AiUsageReportPage';
import AirQualityReportPage from './pages/reports/AirQualityReportPage';
import CustomReportPage from './pages/reports/CustomReportPage';
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
      <Toaster richColors position="top-right" />
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
            <Route path="/devices/:id" element={<DeviceDetailPage />} />
            <Route element={<ReportsLayout />}>
              <Route
                path="/reports"
                element={<Navigate to="/reports/energy" replace />}
              />
              <Route path="/reports/energy" element={<EnergyReportPage />} />
              <Route path="/reports/climate" element={<ClimateReportPage />} />
              <Route
                path="/reports/security"
                element={<SecurityReportPage />}
              />
              <Route
                path="/reports/devices-health"
                element={<DevicesHealthReportPage />}
              />
              <Route
                path="/reports/automations"
                element={<AutomationsReportPage />}
              />
              <Route
                path="/reports/ai-usage"
                element={<AiUsageReportPage />}
              />
              <Route
                path="/reports/air-quality"
                element={<AirQualityReportPage />}
              />
              <Route path="/reports/custom" element={<CustomReportPage />} />
            </Route>
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/rules/new" element={<RuleFormPage />} />
            <Route path="/rules/edit/:id" element={<RuleFormPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/schedules/new" element={<ScheduleFormPage />} />
            <Route path="/schedules/edit/:id" element={<ScheduleFormPage />} />
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
