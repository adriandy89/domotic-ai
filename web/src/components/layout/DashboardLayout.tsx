import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { sseService } from '../../lib/sse';
import { cn } from '../../lib/utils';
import { useActivityStore } from '../../store/useActivityStore';
import { useAuthStore } from '../../store/useAuthStore';
import AIChatbox from '../ai/AIChatbox';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ui/theme-toggle';

export default function DashboardLayout() {
  const { logout, user } = useAuthStore();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Home, label: 'Homes', href: '/homes' },
    { icon: Cpu, label: 'Devices', href: '/devices' },
    { icon: Zap, label: 'Rules', href: '/rules' },
    { icon: KeyRound, label: 'Access', href: '/access' },
    { icon: Activity, label: 'Activity', href: '/activity' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];

  const { addEvent } = useActivityStore();

  useEffect(() => {
    const unsubSensor = sseService.on('sensor.data', (payload) => {
      addEvent('sensor.data', payload);
    });

    const unsubHome = sseService.on('home.status', (payload) => {
      addEvent('home.status', payload);
    });

    const unsubNotif = sseService.on('user.sensor-notification', (payload) => {
      addEvent('user.sensor-notification', payload);
    });

    const unsubAttrs = sseService.on('user.attributes.updated', (payload) => {
      addEvent('user.attributes.updated', payload);
    });

    return () => {
      unsubSensor();
      unsubHome();
      unsubNotif();
      unsubAttrs();
    };
  }, [addEvent]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden transition-colors duration-300">
      {/* Sidebar (Desktop) */}
      <aside
        className={cn(
          'border-r border-border bg-card/50 backdrop-blur-xl hidden md:flex flex-col transition-all duration-300',
          isCollapsed ? 'w-20' : 'w-64',
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-border/50">
          {!isCollapsed && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent whitespace-nowrap overflow-hidden">
              Domotic AI
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn('ml-auto', isCollapsed && 'mx-auto')}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </Button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.1)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  isCollapsed ? 'justify-center' : '',
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors flex-shrink-0',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                {!isCollapsed && (
                  <span className="font-medium whitespace-nowrap overflow-hidden">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div
            className={cn(
              'flex items-center gap-3 mb-4',
              isCollapsed ? 'justify-center flex-col' : 'px-2',
            )}
          >
            <div className="flex justify-center align-center">
              <ThemeToggle />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.name
                    ? user?.name?.slice(0, 20) +
                      (user?.name?.length > 20 ? '...' : '')
                    : 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className={cn(
              'w-full gap-2',
              isCollapsed ? 'justify-center px-0' : 'justify-start',
            )}
            onClick={() => logout()}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden">
          <div className="fixed inset-y-0 left-0 z-50 w-64 h-full bg-card border-r border-border shadow-lg transition-transform duration-300">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                Menu
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.1)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 transition-colors',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border mt-auto">
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="flex justify-center align-center">
                  <ThemeToggle />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user?.name
                      ? user?.name?.slice(0, 20) +
                        (user?.name?.length > 20 ? '...' : '')
                      : 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Domotic AI
            </h1>
          </div>
          <div className="flex gap-2">
            <ThemeToggle />
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* AI Chatbox - Floating */}
      <AIChatbox />
    </div>
  );
}
