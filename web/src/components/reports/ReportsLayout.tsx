import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Bot,
  CalendarClock,
  HeartPulse,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  Wind,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const TABS = [
  { to: '/reports/energy', key: 'energy', icon: Zap },
  { to: '/reports/climate', key: 'climate', icon: Thermometer },
  { to: '/reports/security', key: 'security', icon: ShieldCheck },
  { to: '/reports/devices-health', key: 'devices', icon: HeartPulse },
  { to: '/reports/automations', key: 'automations', icon: CalendarClock },
  { to: '/reports/ai-usage', key: 'aiUsage', icon: Bot },
  { to: '/reports/air-quality', key: 'airQuality', icon: Wind },
  { to: '/reports/custom', key: 'custom', icon: SlidersHorizontal },
] as const;

export default function ReportsLayout() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {t('reports.title')}
          </h2>
          <p className="text-muted-foreground mt-1">{t('reports.subtitle')}</p>
        </div>
        <Activity className="w-8 h-8 text-primary" />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="w-4 h-4" />
              {t(`reports.tabs.${tab.key}`)}
            </NavLink>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
