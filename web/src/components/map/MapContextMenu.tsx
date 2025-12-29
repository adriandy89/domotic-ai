import type { Device } from '../../store/useDevicesStore';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Plus, X } from 'lucide-react';
import DeviceImage from '../device/DeviceImage';

interface MapContextMenuProps {
  x: number;
  y: number;
  unassignedDevices: Device[];
  onSelect: (device: Device) => void;
  onClose: () => void;
}

export function MapContextMenu({
  x,
  y,
  unassignedDevices,
  onSelect,
  onClose,
}: MapContextMenuProps) {
  // Adjust position to keep menu inside viewport
  const menuWidth = 256; // w-64 = 16rem = 256px
  const menuHeight = 280; // approximate height

  let adjustedX = x;
  let adjustedY = y;

  // Prevent going off right edge
  if (x + menuWidth > window.innerWidth) {
    adjustedX = window.innerWidth - menuWidth - 10;
  }

  // Prevent going off bottom edge
  if (y + menuHeight > window.innerHeight) {
    adjustedY = window.innerHeight - menuHeight - 10;
  }

  // Prevent going off left edge
  if (adjustedX < 10) adjustedX = 10;

  // Prevent going off top edge
  if (adjustedY < 10) adjustedY = 10;

  return (
    <Card
      className="fixed z-50 w-64 shadow-lg animate-in fade-in zoom-in-95 duration-200 bg-popover text-popover-foreground"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm font-semibold pl-2">Add Device</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-[200px] p-2 overflow-y-auto">
        {unassignedDevices.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No unassigned devices available
          </div>
        ) : (
          <div className="space-y-1">
            {unassignedDevices.map((device) => (
              <Button
                key={device.id}
                variant="ghost"
                className="w-full justify-start h-auto py-2 px-2"
                onClick={() => onSelect(device)}
              >
                <div className="flex items-center gap-3 w-full overflow-hidden">
                  <DeviceImage
                    device={device}
                    className="w-8 h-8 object-contain"
                    FallbackIcon={Plus}
                    iconClassName="h-4 w-4 text-muted-foreground"
                  />
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-medium truncate w-full text-left">
                      {device.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full text-left">
                      {device.unique_id}
                    </span>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
