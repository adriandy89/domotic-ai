import { NavLink, Outlet } from 'react-router-dom';
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
  { to: '/reports/energy', label: 'Energy', icon: Zap },
  { to: '/reports/climate', label: 'Climate', icon: Thermometer },
  { to: '/reports/security', label: 'Security', icon: ShieldCheck },
  { to: '/reports/devices-health', label: 'Devices', icon: HeartPulse },
  { to: '/reports/automations', label: 'Automations', icon: CalendarClock },
  { to: '/reports/ai-usage', label: 'AI usage', icon: Bot },
  { to: '/reports/air-quality', label: 'Air quality', icon: Wind },
  { to: '/reports/custom', label: 'Custom', icon: SlidersHorizontal },
];

export default function ReportsLayout() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Reports
          </h2>
          <p className="text-muted-foreground mt-1">
            Trends, totals and exports across devices and homes.
          </p>
        </div>
        <Activity className="w-8 h-8 text-primary" />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
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
              {t.label}
            </NavLink>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
