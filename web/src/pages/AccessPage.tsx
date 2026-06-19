import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { Home, Cpu, Users, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import HomesTable from '../components/access/HomesTable';
import DevicesTable from '../components/access/DevicesTable';
import UsersTable from '../components/access/UsersTable';
import { useHomesStore } from '../store/useHomesStore';

interface HomeStatistics {
  totalHomes: number;
  enabledHomes: number;
  disabledHomes: number;
  maxHomes?: number | null;
}

interface DeviceStatistics {
  totalDevices: number;
  enabledDevices: number;
  disabledDevices: number;
  maxDevices?: number | null;
}

interface UserStatistics {
  totalUsers: number;
  enabledUsers: number;
  disabledUsers: number;
  maxUsers?: number | null;
}

interface Statistics {
  homes: HomeStatistics | null;
  devices: DeviceStatistics | null;
  users: UserStatistics | null;
}

export default function AccessPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('homes');
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Get fetchHomes from global store to refresh after CRUD operations
  const { fetchHomes } = useHomesStore();

  const fetchHomeStats = useCallback(async () => {
    try {
      const res = await api.get<HomeStatistics>(
        '/homes/statistics/organization',
      );
      setStats((prev) => ({
        ...prev,
        homes: res.data,
        devices: prev?.devices ?? null,
        users: prev?.users ?? null,
      }));
    } catch (error: any) {
      console.error('Failed to fetch home statistics:', error);
    }
  }, []);

  const fetchDeviceStats = useCallback(async () => {
    try {
      const res = await api.get<DeviceStatistics>(
        '/devices/statistics/organization',
      );
      setStats((prev) => ({
        ...prev,
        devices: res.data,
        homes: prev?.homes ?? null,
        users: prev?.users ?? null,
      }));
    } catch (error: any) {
      console.error('Failed to fetch device statistics:', error);
    }
  }, []);

  const fetchUserStats = useCallback(async () => {
    try {
      const res = await api.get<UserStatistics>(
        '/users/statistics/organization',
      );
      setStats((prev) => ({
        ...prev,
        users: res.data,
        homes: prev?.homes ?? null,
        devices: prev?.devices ?? null,
      }));
    } catch (error: any) {
      console.error('Failed to fetch user statistics:', error);
    }
  }, []);

  const fetchAllStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [homesRes, devicesRes, usersRes] = await Promise.all([
        api
          .get<HomeStatistics>('/homes/statistics/organization')
          .catch(() => ({ data: null })),
        api
          .get<DeviceStatistics>('/devices/statistics/organization')
          .catch(() => ({ data: null })),
        api
          .get<UserStatistics>('/users/statistics/organization')
          .catch(() => ({ data: null })),
      ]);
      setStats({
        homes: homesRes.data,
        devices: devicesRes.data,
        users: usersRes.data,
      });
    } catch (error: any) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Initial load - fetch all stats
  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  // Refresh only active tab stats when tab changes
  useEffect(() => {
    if (activeTab === 'homes') fetchHomeStats();
    else if (activeTab === 'devices') fetchDeviceStats();
    else if (activeTab === 'users') fetchUserStats();
  }, [activeTab, fetchHomeStats, fetchDeviceStats, fetchUserStats]);

  const summaryCards = [
    {
      tab: 'homes',
      icon: Home,
      value: stats?.homes?.totalHomes ?? '-',
      enabledCount: stats?.homes?.enabledHomes ?? null,
      maxValue: stats?.homes?.maxHomes ?? null,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
    {
      tab: 'devices',
      icon: Cpu,
      value: stats?.devices?.totalDevices ?? '-',
      enabledCount: stats?.devices?.enabledDevices ?? null,
      maxValue: stats?.devices?.maxDevices ?? null,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      tab: 'users',
      icon: Users,
      value: stats?.users?.totalUsers ?? '-',
      enabledCount: stats?.users?.enabledUsers ?? null,
      maxValue: stats?.users?.maxUsers ?? null,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {t('access.title')}
          </h2>
          <p className="text-muted-foreground">{t('access.subtitle')}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((item) => (
          <Card
            key={item.tab}
            className={`bg-card/40 border-border cursor-pointer hover:border-primary/30 transition-all duration-300 ${
              activeTab === item.tab
                ? 'border-primary/50 shadow-[0_0_10px_rgba(var(--primary),0.1)]'
                : ''
            }`}
            onClick={() => setActiveTab(item.tab)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t(`access.tabs.${item.tab}`)}
              </CardTitle>
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-card-foreground">
                    {item.value}
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {item.enabledCount != null
                        ? t('access.summary.enabled', {
                            count: item.enabledCount,
                          })
                        : t('common.loading')}
                    </p>
                    {item.maxValue != null && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${
                          typeof item.value === 'number' &&
                          item.value >= item.maxValue
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                            : 'border-border/60 bg-muted/60 text-muted-foreground'
                        }`}
                        title={t('access.summary.limit', {
                          count: item.maxValue,
                        })}
                      >
                        {t('access.summary.limit', { count: item.maxValue })}
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="homes" className="gap-2">
            <Home className="h-4 w-4" />
            {t('access.tabs.homes')}
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <Cpu className="h-4 w-4" />
            {t('access.tabs.devices')}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            {t('access.tabs.users')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="homes">
          <HomesTable
            onDataChange={() => {
              fetchHomeStats();
              fetchHomes();
            }}
          />
        </TabsContent>

        <TabsContent value="devices">
          <DevicesTable
            onDataChange={() => {
              fetchDeviceStats();
              fetchHomes();
            }}
          />
        </TabsContent>

        <TabsContent value="users">
          <UsersTable
            onDataChange={() => {
              fetchUserStats();
              fetchHomes();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
