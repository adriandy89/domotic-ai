import type { Device } from '../../store/useDevicesStore';
import { cn } from '../../lib/utils';
import { BatteryLow, WifiOff } from 'lucide-react';
import DeviceImage from '../device/DeviceImage';

interface DeviceMarkerProps {
  device: Device;
  data?: Record<string, any> | undefined;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
}

export function DeviceMarker({
  device,
  data,
  onClick,
  onContextMenu,
  onMouseDown,
  isSelected,
}: DeviceMarkerProps) {
  // Battery Alert Logic (from old frontend)
  // Shows if battery < 20 OR battery_low === true
  const batteryAlert =
    (!isNaN(data?.battery) && data?.battery < 20) || data?.battery_low === true;

  // Last Seen Alert Logic (from old frontend)
  // Shows if last_seen is older than 8 hours
  let lastSeenAlert = false;
  if (data?.last_seen) {
    const lastSeen = new Date(data.last_seen);
    const now = new Date();
    const diff = now.getTime() - lastSeen.getTime();
    if (diff > 1000 * 60 * 60 * 8) {
      lastSeenAlert = true;
    }
  }

  // Alert Status Logic (from old frontend)
  // Shows if any critical sensor state is triggered
  const alertStatus =
    data?.contact === false ||
    data?.vibration === true ||
    data?.occupancy === true ||
    data?.presence === true ||
    data?.smoke === true ||
    data?.water_leak === true;

  return (
    <div
      title={`${device.name} - ${device.model}`}
      className={cn(
        'absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group flex flex-col items-center',
        isSelected && 'z-30',
      )}
      style={{
        left: `${device.x}%`,
        top: `${device.y}%`,
        zIndex: isSelected ? 30 : 10,
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
    >
      <div
        className={cn(
          'relative rounded-full bg-slate-400 border border-gray-300 bg-opacity-90 p-0.5',
          'transition-transform hover:scale-110 active:scale-95',
        )}
        style={{
          boxShadow: alertStatus
            ? '0 0 10px rgba(250, 0, 0, 0.9)'
            : '0 0 15px rgba(0, 84, 233, 0.8)',
        }}
      >
        {/* Alert Status Icon - Top Right (!) */}
        {alertStatus && (
          <div className="absolute top-[-5px] right-[-5px] bg-orange-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold animate-pulse">
            !
          </div>
        )}

        {/* Battery Alert - Top Left */}
        {batteryAlert && (
          <div className="absolute top-[-5px] left-[-5px] bg-orange-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold animate-pulse">
            <BatteryLow size={16} />
          </div>
        )}

        {/* Last Seen Alert - Bottom Center */}
        {lastSeenAlert && (
          <div className="absolute bottom-[-15px] left-1/2 transform -translate-x-1/2 bg-red-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold animate-bounce">
            <WifiOff size={16} />
          </div>
        )}

        <DeviceImage
          device={device}
          className="h-10 w-10"
          iconClassName="w-5 h-5"
        />
      </div>
    </div>
  );
}
