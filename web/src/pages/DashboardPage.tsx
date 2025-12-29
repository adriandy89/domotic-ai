import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Activity,
  Home,
  Wifi,
  WifiOff,
  Cpu,
  Radio,
  Battery,
  Thermometer,
} from 'lucide-react';
import { useHomesStore } from '../store/useHomesStore';
import { useDevicesStore } from '../store/useDevicesStore';
import { sseService } from '../lib/sse';

interface SSEEvent {
  id: number;
  timestamp: Date;
  topic: string;
  payload: string;
}

const MAX_EVENTS = 100;

export default function DashboardPage() {
  const { homes, homeIds, fetchHomes } = useHomesStore();
  const { devices, devicesData } = useDevicesStore();

  // Refresh homes data on page mount
  useEffect(() => {
    fetchHomes();
  }, [fetchHomes]);

  const [events, setEvents] = useState<SSEEvent[]>([]);
  const eventIdRef = useRef(0);
  const eventsContainerRef = useRef<HTMLDivElement>(null);

  // Calculate summaries from real data
  const totalHomes = homeIds.length;
  const connectedHomes = homeIds.filter((id) => homes[id]?.connected).length;
  const disconnectedHomes = totalHomes - connectedHomes;
  const totalDevices = Object.keys(devices).length;

  // Count devices with battery
  const batteryDevices = Object.values(devices).filter((d) =>
    d.attributes?.power_source?.toLowerCase().includes('battery'),
  );
  const lowBatteryDevices = batteryDevices.filter((d) => {
    const data = devicesData[d.id]?.data;
    const battery = data?.battery as number | undefined;
    return battery !== undefined && battery < 20;
  });

  // Count devices with recent data (active in last 5 minutes)
  const now = Date.now();
  const activeDevices = Object.values(devicesData).filter((d) => {
    if (!d.timestamp) return false;
    const lastUpdate = new Date(d.timestamp).getTime();
    return now - lastUpdate < 5 * 60 * 1000; // 5 minutes
  }).length;

  // Get average temperature from devices that have temperature
  const tempValues = Object.values(devicesData)
    .map((d) => d.data?.temperature as number | undefined)
    .filter((t): t is number => t !== undefined);
  const avgTemperature =
    tempValues.length > 0
      ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(1)
      : null;

  // Handle incoming SSE events
  const handleSSEEvent = useCallback((topic: string, payload: unknown) => {
    const newEvent: SSEEvent = {
      id: ++eventIdRef.current,
      timestamp: new Date(),
      topic,
      payload: JSON.stringify(payload, null, 2),
    };

    setEvents((prev) => {
      const updated = [newEvent, ...prev];
      // Keep only last 100 events
      return updated.slice(0, MAX_EVENTS);
    });
  }, []);

  // Subscribe to SSE events
  useEffect(() => {
    const unsubSensor = sseService.on('sensor.data', (payload) => {
      handleSSEEvent('sensor.data', payload);
    });

    const unsubHome = sseService.on('home.status', (payload) => {
      handleSSEEvent('home.status', payload);
    });

    const unsubNotif = sseService.on('user.sensor-notification', (payload) => {
      handleSSEEvent('user.sensor-notification', payload);
    });

    const unsubPing = sseService.on('ping', (payload) => {
      handleSSEEvent('ping', payload);
    });

    return () => {
      unsubSensor();
      unsubHome();
      unsubNotif();
      unsubPing();
    };
  }, [handleSSEEvent]);

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
    {
      title: 'Battery Status',
      icon: Battery,
      value: `${batteryDevices.length} devices`,
      subtitle:
        lowBatteryDevices.length > 0
          ? `${lowBatteryDevices.length} low battery`
          : 'All OK',
      color:
        lowBatteryDevices.length > 0 ? 'text-amber-400' : 'text-emerald-400',
    },
  ];

  // Add temperature card if we have data
  if (avgTemperature !== null) {
    summaryCards.push({
      title: 'Avg Temperature',
      icon: Thermometer,
      value: `${avgTemperature}°C`,
      subtitle: `From ${tempValues.length} sensors`,
      color: 'text-rose-400',
    });
  }

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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
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

      {/* Live Events Section */}
      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Events
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {events.length} events (max {MAX_EVENTS})
          </span>
        </CardHeader>
        <CardContent>
          <div
            ref={eventsContainerRef}
            className="h-[400px] overflow-y-auto space-y-2 font-mono text-xs"
            style={{ scrollbarWidth: 'thin' }}
          >
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Waiting for events...</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="p-2 bg-background/50 rounded border border-border/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        event.topic === 'sensor.data'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : event.topic === 'home.status'
                            ? 'bg-amber-500/20 text-amber-400'
                            : event.topic === 'ping'
                              ? 'bg-gray-500/20 text-gray-400'
                              : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {event.topic}
                    </span>
                    <span className="text-muted-foreground">
                      {event.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                    {event.payload}
                  </pre>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
