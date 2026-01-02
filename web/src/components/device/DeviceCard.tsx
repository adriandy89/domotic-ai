import { useMemo, useCallback, useState } from 'react';
import {
  Battery,
  Wifi,
  Thermometer,
  Droplets,
  Power,
  Lightbulb,
  AlertTriangle,
  Zap,
  Eye,
  DoorOpen,
  Flame,
  Volume2,
  Cpu,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit,
  MoreVertical,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { Feature } from './Feature';
import DeviceImage from './DeviceImage';
import LearnIRModal from './LearnIRModal';
import CommandSelector from './CommandSelector';
import type { Device, DeviceData } from '../../store/useDevicesStore';

interface DeviceCardProps {
  device: Device;
  deviceData?: DeviceData;
  onCommand?: (deviceId: string, command: Record<string, unknown>) => void;
  onRename?: (deviceId: string, newName: string) => void;
  onRemove?: (deviceId: string) => void;
}

// Get icon for device type based on exposes
function getDeviceIcon(device: Device) {
  const exposes = device.attributes?.definition?.exposes || [];
  const exposeNames = exposes.map((e) => e.name || e.property);

  if (exposeNames.includes('state') || exposeNames.includes('switch'))
    return Lightbulb;
  if (exposeNames.includes('temperature')) return Thermometer;
  if (exposeNames.includes('humidity')) return Droplets;
  if (exposeNames.includes('contact')) return DoorOpen;
  if (exposeNames.includes('occupancy') || exposeNames.includes('presence'))
    return Eye;
  if (exposeNames.includes('smoke')) return Flame;
  if (exposeNames.includes('water_leak')) return Droplets;
  if (exposeNames.includes('alarm')) return Volume2;
  if (exposeNames.includes('power') || exposeNames.includes('energy'))
    return Zap;

  return Cpu;
}

// Get battery status color
function getBatteryColor(battery?: number): string {
  if (battery === undefined) return 'text-muted-foreground';
  if (battery <= 10) return 'text-red-500';
  if (battery <= 30) return 'text-amber-500';
  return 'text-emerald-500';
}

// Get link quality status
function getLqiStatus(lqi?: number): { color: string; label: string } {
  if (lqi === undefined)
    return { color: 'text-muted-foreground', label: 'N/A' };
  if (lqi >= 150) return { color: 'text-emerald-500', label: 'Excellent' };
  if (lqi >= 80) return { color: 'text-cyan-500', label: 'Good' };
  if (lqi >= 40) return { color: 'text-amber-500', label: 'Fair' };
  return { color: 'text-red-500', label: 'Poor' };
}

// Format last seen timestamp
function formatLastSeen(timestamp?: string | number): string {
  if (!timestamp) return 'Never';

  const date =
    typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function DeviceCard({
  device,
  deviceData,
  onCommand,
  onRename,
  onRemove,
}: DeviceCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(device.name);
  const [showLearnIR, setShowLearnIR] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const data = deviceData?.data || {};
  const exposes = device.attributes?.definition?.exposes || [];

  // Separate main exposes from diagnostic (diagnostic shown in footer)
  const mainExposes = useMemo(() => {
    const hiddenExposes = [
      'linkquality',
      'learn_ir_code',
      'learned_ir_code',
      'ir_code_to_send',
    ];
    return exposes.filter(
      (expose) =>
        expose.category !== 'diagnostic' &&
        !hiddenExposes.includes(expose.name),
    );
  }, [exposes]);

  const battery = data.battery as number | undefined;
  const linkquality = data.linkquality as number | undefined;
  const lastSeen = data.last_seen as string | number | undefined;
  const lqiStatus = getLqiStatus(linkquality);

  const powerSource = device.attributes?.power_source || 'Unknown';
  const vendor = device.attributes?.definition?.vendor || 'Unknown';
  const model = device.attributes?.definition?.model || device.model;
  const description =
    device.attributes?.definition?.description || device.description;
  const deviceType = device.attributes?.type || 'Device';

  // Handle feature change
  const handleChange = useCallback(
    (property: string, value: unknown) => {
      if (!onCommand) return;
      onCommand(device.id, { [property]: value });
    },
    [onCommand, device.id],
  );

  // Handle rename
  const handleRename = useCallback(() => {
    if (onRename && editName !== device.name) {
      onRename(device.id, editName);
    }
    setIsEditing(false);
  }, [onRename, editName, device.id, device.name]);

  return (
    <Card className="bg-card/50 hover:bg-card/70 transition-all duration-300 border-border/50 hover:border-primary/30 group relative h-full">
      <CardContent className="p-0 h-full flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-border/30">
          <div className="flex items-start gap-3">
            {/* Device Image */}
            <DeviceImage
              device={device}
              className="h-10 w-10 rounded-lg shrink-0"
              FallbackIcon={getDeviceIcon(device)}
            />

            {/* Device Info */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    onBlur={handleRename}
                    autoFocus
                    className="flex-1 h-7 text-sm bg-background border border-border rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ) : (
                <div className="font-semibold text-foreground truncate block">
                  {device.name || device.unique_id}
                </div>
              )}
              <p className="text-xs text-muted-foreground truncate">
                {vendor} • {model}
              </p>
              {description && (
                <p
                  className="text-xs text-muted-foreground/70 truncate mt-0.5"
                  title={description}
                >
                  {description}
                </p>
              )}
              <p className="text-xs text-muted-foreground/60 mt-1">
                Last seen: {formatLastSeen(lastSeen)}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {(onRename && onRemove) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowActions(!showActions)}
                  title="Actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Action dropdown */}
          {showActions && (
            <div className="absolute right-4 top-14 z-10 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[140px]">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowActions(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
              >
                <Edit className="h-4 w-4" />
                Rename
              </button>
              <button
                onClick={() => {
                  onRemove?.(device.id);
                  setShowActions(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          )}
        </div>

        {/* IR Remote Controls */}
        {exposes.some((e) => e.name === 'learn_ir_code') && (
          <div className="px-3 py-4 flex flex-col gap-4 border-b border-border/30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLearnIR(true)}
              className="text-xs h-7"
            >
              Learn IR
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowCommands(true)}
              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Learned Commands ({device.learned_commands?.length || 0})
            </Button>

            <LearnIRModal
              deviceId={device.id}
              isOpen={showLearnIR}
              onClose={() => setShowLearnIR(false)}
              onCommand={(cmd) =>
                handleChange('learn_ir_code', cmd.learn_ir_code)
              }
              learnedIrCode={data.learned_ir_code as string}
            />

            <CommandSelector
              deviceId={device.id}
              commands={device.learned_commands || []}
              isOpen={showCommands}
              onClose={() => setShowCommands(false)}
              onCommand={(cmd) => {
                if (onCommand) {
                  onCommand(device.id, cmd);
                }
              }}
            />
          </div>
        )}

        {/* Features/Exposes */}
        {mainExposes.length > 0 && (
          <div className="p-2 flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Properties ({mainExposes.length})
              </span>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>

            {isExpanded && (
              <div
                className="space-y-0 max-h-[390px] overflow-y-auto"
                style={{ scrollbarWidth: 'thin' }}
              >
                {mainExposes.map((expose) => (
                  <Feature
                    key={expose.property || expose.name}
                    expose={expose}
                    value={data[expose.property]}
                    onChange={handleChange}
                    data={data}
                  />
                ))}

                {mainExposes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No properties available
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer with badges - pushed to bottom */}
        <div className="mt-auto px-3 py-2 bg-background/20 border-t border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Link Quality */}
              <div
                className={cn('flex items-center gap-1', lqiStatus.color)}
                title={`Link Quality: ${lqiStatus.label}`}
              >
                <Wifi className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {linkquality ?? 'N/A'}
                </span>
              </div>

              {/* Battery (if applicable) */}
              {powerSource.toLowerCase().includes('battery') && (
                <div
                  className={cn(
                    'flex items-center gap-1',
                    getBatteryColor(battery),
                  )}
                  title="Battery"
                >
                  <Battery className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {battery !== undefined ? `${battery}%` : 'N/A'}
                  </span>
                </div>
              )}

              {/* Power source indicator for mains */}
              {powerSource.toLowerCase().includes('mains') && (
                <div
                  className="flex items-center gap-1 text-cyan-500"
                  title="AC Powered"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">AC</span>
                </div>
              )}
            </div>

            {/* Device type badge */}
            <span className="text-xs px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
              {deviceType}
            </span>
          </div>

          {/* Warning indicators */}
          {(data.battery_low === true ||
            data.tamper === true ||
            data.device_fault === true) && (
              <div className="mt-2 flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs">
                  {data.battery_low === true && 'Low Battery • '}
                  {data.tamper === true && 'Tamper Alert • '}
                  {data.device_fault === true && 'Device Fault'}
                </span>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
