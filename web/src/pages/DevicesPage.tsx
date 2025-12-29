import { useMemo, useCallback } from 'react';
import { Home, Wifi, WifiOff, Search } from 'lucide-react';
import { useHomesStore } from '../store/useHomesStore';
import { useDevicesStore } from '../store/useDevicesStore';
import { api } from '../lib/api';
import DeviceCard from '../components/device/DeviceCard';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';

export default function DevicesPage() {
  const { homes, homeIds } = useHomesStore();
  const { devices, devicesByHome, devicesData } = useDevicesStore();

  // Data is already fetched on auth - no need to refetch on page navigation

  // Send command to device
  const handleCommand = useCallback(
    async (deviceId: string, command: Record<string, unknown>) => {
      try {
        await api.post('/devices/command/send', {
          device_id: deviceId,
          command,
        });
        console.log('Command sent:', deviceId, command);
      } catch (error) {
        console.error('Failed to send command:', error);
      }
    },
    [],
  );

  // Rename device
  const handleRename = useCallback(
    async (deviceId: string, newName: string) => {
      try {
        const response = await api.put(`/devices/${deviceId}`, {
          name: newName,
        });
        if (response.data?.ok) {
          // Update device name in store
          useDevicesStore.getState().updateDevice(deviceId, { name: newName });
          console.log('Device renamed:', deviceId, newName);
        }
      } catch (error) {
        console.error('Failed to rename device:', error);
      }
    },
    [],
  );

  // Remove device
  const handleRemove = useCallback(async (deviceId: string) => {
    if (!confirm('Are you sure you want to remove this device?')) return;
    try {
      await api.delete(`/devices/${deviceId}`);
      console.log('Device removed:', deviceId);
      // TODO: Refresh device list
    } catch (error) {
      console.error('Failed to remove device:', error);
    }
  }, []);

  // Group devices by home
  const homeGroups = useMemo(() => {
    return homeIds
      .map((homeId) => {
        const home = homes[homeId];
        const deviceIds = devicesByHome[homeId] || [];
        const homeDevices = deviceIds
          .map((id) => devices[id])
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          home,
          devices: homeDevices,
        };
      })
      .filter((group) => group.devices.length > 0);
  }, [homeIds, homes, devicesByHome, devices]);

  const totalDevices = Object.keys(devices).length;
  const connectedHomes = homeIds.filter((id) => homes[id]?.connected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Devices
          </h2>
          <p className="text-muted-foreground">
            {totalDevices} devices across {homeIds.length} homes
          </p>
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">
            <Wifi className="h-4 w-4" />
            <span className="text-sm font-medium">{connectedHomes} Online</span>
          </div>
          {homeIds.length - connectedHomes > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500">
              <WifiOff className="h-4 w-4" />
              <span className="text-sm font-medium">
                {homeIds.length - connectedHomes} Offline
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {homeGroups.length === 0 && (
        <Card className="bg-card/40 border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No devices found
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Your devices will appear here once they are connected and
              synchronized.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Homes with devices */}
      {homeGroups.map(({ home, devices: homeDevices }) => (
        <div key={home.id} className="space-y-4">
          {/* Home header */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'p-2 rounded-lg',
                home.connected ? 'bg-emerald-500/10' : 'bg-red-500/10',
              )}
            >
              <Home
                className={cn(
                  'h-5 w-5',
                  home.connected ? 'text-emerald-500' : 'text-red-500',
                )}
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                {home.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {homeDevices.length} devices •{' '}
                {home.connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>

          {/* Devices grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {homeDevices
              .sort((a, b) => {
                const aExposes =
                  a.attributes?.definition?.exposes?.filter(
                    (expose) =>
                      expose.category !== 'diagnostic' &&
                      expose.name !== 'linkquality',
                  ) || [];
                const bExposes =
                  b.attributes?.definition?.exposes?.filter(
                    (expose) =>
                      expose.category !== 'diagnostic' &&
                      expose.name !== 'linkquality',
                  ) || [];
                return aExposes.length - bExposes.length;
              })
              .map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  deviceData={devicesData[device.id]}
                  onCommand={handleCommand}
                  onRename={handleRename}
                  onRemove={handleRemove}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
