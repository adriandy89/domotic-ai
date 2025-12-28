import { useState, useEffect, useCallback } from 'react';
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

interface HomeStatistics {
  totalHomes: number;
  enabledHomes: number;
  disabledHomes: number;
}

interface DeviceStatistics {
  totalDevices: number;
  enabledDevices: number;
  disabledDevices: number;
}

interface UserStatistics {
  totalUsers: number;
  enabledUsers: number;
  disabledUsers: number;
}

interface Statistics {
  homes: HomeStatistics | null;
  devices: DeviceStatistics | null;
  users: UserStatistics | null;
}

export default function AccessPage() {
  const [activeTab, setActiveTab] = useState('homes');
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchStatistics = useCallback(async () => {
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
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const summaryCards = [
    {
      title: 'Homes',
      icon: Home,
      value: stats?.homes?.totalHomes ?? '-',
      subtitle: stats?.homes
        ? `${stats.homes.enabledHomes} enabled`
        : 'Loading...',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      tab: 'homes',
    },
    {
      title: 'Devices',
      icon: Cpu,
      value: stats?.devices?.totalDevices ?? '-',
      subtitle: stats?.devices
        ? `${stats.devices.enabledDevices} enabled`
        : 'Loading...',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      tab: 'devices',
    },
    {
      title: 'Users',
      icon: Users,
      value: stats?.users?.totalUsers ?? '-',
      subtitle: stats?.users
        ? `${stats.users.enabledUsers} enabled`
        : 'Loading...',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      tab: 'users',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Access
          </h2>
          <p className="text-muted-foreground">
            Manage homes, devices, and users in your system
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((item) => (
          <Card
            key={item.title}
            className={`bg-card/40 border-border cursor-pointer hover:border-primary/30 transition-all duration-300 ${
              activeTab === item.tab
                ? 'border-primary/50 shadow-[0_0_10px_rgba(var(--primary),0.1)]'
                : ''
            }`}
            onClick={() => setActiveTab(item.tab)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.subtitle}
                  </p>
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
            Homes
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <Cpu className="h-4 w-4" />
            Devices
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="homes">
          <HomesTable />
        </TabsContent>

        <TabsContent value="devices">
          <DevicesTable />
        </TabsContent>

        <TabsContent value="users">
          <UsersTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
