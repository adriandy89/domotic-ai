import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/card';
import {
  Home,
  Wifi,
  WifiOff,
  Cpu,
  Radio,
  Battery,
  Thermometer,
  ShieldCheck,
  ShieldAlert,
  Droplets,
  Wind,
  SignalLow,
} from 'lucide-react';
import { useHomesStore } from '../store/useHomesStore';
import { useDevicesStore } from '../store/useDevicesStore';
import { sseService } from '../lib/sse';

export default function DashboardPage() {
  const { homes, homeIds } = useHomesStore();
  const { devices, devicesData } = useDevicesStore();

  // Data is already fetched on auth - no need to refetch on page navigation

  // Calculate summaries from real data
  const totalHomes = homeIds.length;
  const connectedHomes = homeIds.filter((id) => homes[id]?.connected).length;
  const disconnectedHomes = totalHomes - connectedHomes;
  const totalDevices = Object.keys(devices).length;

  const activeDevices = Object.values(devicesData).filter((d) => {
    if (!d.timestamp) return false;
    const lastUpdate = new Date(d.timestamp).getTime();
    return Date.now() - lastUpdate < 5 * 60 * 1000;
  }).length;

  // --- SECURITY ANALYTICS ---
  const securityIssues = Object.values(devices)
    .map((device) => {
      const data = devicesData[device.id]?.data || {};
      const exposes = device.attributes?.definition?.exposes || [];
      const hasContact = exposes.some(
        (e) => e.name === 'contact' || e.property === 'contact',
      );
      const hasSmoke = exposes.some(
        (e) => e.name === 'smoke' || e.property === 'smoke',
      );
      const hasWater = exposes.some(
        (e) => e.name === 'water_leak' || e.property === 'water_leak',
      );

      if (hasContact && data.contact === false)
        return {
          device,
          type: 'Open',
          icon: ShieldAlert,
          color: 'text-red-500',
        };
      if (hasSmoke && data.smoke === true)
        return {
          device,
          type: 'Smoke',
          icon: ShieldAlert,
          color: 'text-red-500 animate-pulse',
        };
      if (hasWater && data.water_leak === true)
        return {
          device,
          type: 'Water Leak',
          icon: Droplets,
          color: 'text-blue-500 animate-pulse',
        };
      return null;
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const isSecure = securityIssues.length === 0;

  // --- CLIMATE ANALYTICS ---
  const climateSensors = Object.values(devices)
    .map((device) => {
      const data = devicesData[device.id]?.data;
      if (!data || data.temperature === undefined) return null;
      return {
        id: device.id,
        name: device.name,
        temp: data.temperature as number,
        humidity: data.humidity as number | undefined,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.temp - a.temp);

  const avgTemp =
    climateSensors.length > 0
      ? (
          climateSensors.reduce((sum, s) => sum + s.temp, 0) /
          climateSensors.length
        ).toFixed(1)
      : null;

  // --- MAINTENANCE ANALYTICS ---
  const lowBatteryDevices = Object.values(devices)
    .map((device) => {
      const data = devicesData[device.id]?.data;
      const battery = data?.battery as number | undefined;
      if (battery !== undefined && battery < 20) return { device, battery };
      return null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const poorSignalDevices = Object.values(devices)
    .map((device) => {
      const data = devicesData[device.id]?.data;
      const lqi = data?.linkquality as number | undefined;
      // LQI < 40 usually indicates weak signal
      if (lqi !== undefined && lqi < 40) return { device, lqi };
      return null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const summaryCards = [
    {
      title: 'Total Homes',
      icon: Home,
      value: totalHomes.toString(),
      subtitle: `${connectedHomes} online, ${disconnectedHomes} offline`,
      color: 'text-cyan-400',
    },
    {
      title: 'Total Devices',
      icon: Cpu,
      value: totalDevices.toString(),
      subtitle: `${activeDevices} active recently`,
      color: 'text-emerald-400',
    },
    {
      title: 'Connection Status',
      icon: connectedHomes === totalHomes ? Wifi : WifiOff,
      value:
        connectedHomes === totalHomes
          ? 'All Online'
          : `${disconnectedHomes} Offline`,
      subtitle: sseService.isConnected() ? 'SSE Connected' : 'SSE Disconnected',
      color:
        connectedHomes === totalHomes ? 'text-emerald-400' : 'text-amber-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h2>
          <p className="text-muted-foreground">
            Overview of your smart home system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${sseService.isConnected() ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}
          >
            <Radio className="h-3 w-3" />
            <span className="text-xs font-medium">
              {sseService.isConnected() ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((item, i) => (
          <Card key={i} className="bg-card/40 border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-card-foreground">
                {item.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {item.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Insights Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* NETWORK HEALTH */}
        <Card className="bg-card/40 border-border col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wifi className="h-5 w-5 text-primary" />
              Network Health
            </CardTitle>
            <CardDescription>Signal quality and connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            {poorSignalDevices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-emerald-500 gap-2">
                <Wifi className="h-10 w-10 opacity-50" />
                <span className="font-medium">Signals Strong</span>
                <p className="text-xs text-muted-foreground">
                  All devices reporting good LQI
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-amber-500">
                  {poorSignalDevices.length} devices with potential weak signal
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {poorSignalDevices.map((item) => (
                    <div
                      key={item.device.id}
                      className="flex justify-between items-center bg-background/30 p-2 rounded"
                    >
                      <span
                        className="text-sm truncate max-w-[150px]"
                        title={item.device.name}
                      >
                        {item.device.name}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <SignalLow className="h-3 w-3" />
                        {item.lqi} LQI
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECURITY STATUS */}
        <Card className="bg-card/40 border-border col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {isSecure ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
              )}
              Security Status
            </CardTitle>
            <CardDescription>
              {isSecure
                ? 'All monitored zones are secure'
                : 'Attention required'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSecure ? (
              <div className="flex flex-col items-center justify-center py-6 text-emerald-500 gap-2">
                <ShieldCheck className="h-12 w-12 opacity-50" />
                <span className="font-medium">System Secure</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {securityIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded bg-red-500/10 border border-red-500/20"
                  >
                    <div className="flex items-center gap-2">
                      <issue.icon className={`h-4 w-4 ${issue.color}`} />
                      <span className="text-sm font-medium">
                        {issue.device.name}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-red-400 uppercase">
                      {issue.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CLIMATE OVERVIEW */}
        <Card className="bg-card/40 border-border col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Thermometer className="h-5 w-5 text-rose-500" />
              Climate
            </CardTitle>
            <CardDescription>
              {avgTemp
                ? `Avg. Temperature: ${avgTemp}°C`
                : 'No temperature data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {climateSensors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                <Wind className="h-10 w-10 opacity-20" />
                <span className="text-sm">No climate sensors active</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/50">
                  <span>Room</span>
                  <span>Temp / Humidity</span>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {climateSensors.map((sensor) => (
                    <div
                      key={sensor.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span
                        className="text-sm truncate max-w-[140px]"
                        title={sensor.name}
                      >
                        {sensor.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-medium ${sensor.temp > 25 ? 'text-amber-500' : 'text-emerald-400'}`}
                        >
                          {sensor.temp.toFixed(1)}°C
                        </span>
                        {sensor.humidity && (
                          <span className="text-xs text-blue-400 flex items-center gap-0.5">
                            <Droplets className="h-3 w-3" />
                            {sensor.humidity}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BATTERY HEALTH (Only if issues exist) */}
        {lowBatteryDevices.length > 0 && (
          <Card className="bg-card/40 border-border col-span-1 md:col-span-2 lg:col-span-3 border-amber-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-500">
                <Battery className="h-5 w-5" />
                Low Battery Warnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {lowBatteryDevices.map((item) => (
                  <div
                    key={item.device.id}
                    className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20"
                  >
                    <span className="text-sm font-medium truncate">
                      {item.device.name}
                    </span>
                    <span
                      className={`text-xs font-bold ${item.battery < 10 ? 'text-red-500' : 'text-amber-500'}`}
                    >
                      {item.battery}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
