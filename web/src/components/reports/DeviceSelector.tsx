import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useDevicesStore } from '../../store/useDevicesStore';

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
      .filter((d) => {
        if (!hasProperty) return true;
        const exposes = d.attributes?.definition?.exposes ?? [];
        const flat = flatten(exposes);
        return flat.some(
          (e) => e.property === hasProperty || e.name === hasProperty,
        );
      })
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

interface FlatExpose {
  name?: string;
  property?: string;
  type?: string;
  features?: FlatExpose[];
}

function flatten(exposes: FlatExpose[]): FlatExpose[] {
  const out: FlatExpose[] = [];
  for (const e of exposes) {
    if (e.features && e.features.length > 0) {
      out.push(...flatten(e.features));
    } else if (e.property || e.name) {
      out.push(e);
    }
  }
  return out;
}
