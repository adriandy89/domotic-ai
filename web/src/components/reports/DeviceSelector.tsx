import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useDevicesStore } from '../../store/useDevicesStore';
import { hasExpose } from '../../lib/device-capabilities';

interface DeviceSelectorProps {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  /**
   * Optional filter — only show devices that expose the given property
   * (e.g. "power", "temperature"). If omitted, all devices are shown.
   */
  hasProperty?: string;
  homeId?: string | null;
}

export default function DeviceSelector({
  value,
  onChange,
  placeholder = 'Select device',
  hasProperty,
  homeId,
}: DeviceSelectorProps) {
  const { devices } = useDevicesStore();

  const list = useMemo(() => {
    return Object.values(devices)
      .filter((d) => !d.disabled)
      .filter((d) => (homeId ? d.home_id === homeId : true))
      .filter((d) => (hasProperty ? hasExpose(d, [hasProperty]) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [devices, homeId, hasProperty]);

  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]">
        <SelectValue placeholder={placeholder}>
          {value ? devices[value]?.name : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {list.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No matching devices
          </div>
        ) : (
          list.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

