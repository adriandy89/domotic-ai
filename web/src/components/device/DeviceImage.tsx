import { useState } from 'react';
import { Cpu } from 'lucide-react';
import type { Device } from '../../store/useDevicesStore';

const Z2M_IMAGE_BASE = 'https://www.zigbee2mqtt.io/images/devices/';

// Sanitize device model name for Z2M image URL
function sanitizeModelName(model?: string): string | null {
  if (!model) return null;
  return model.replace(/[:\s/]/g, '-');
}

// Get Z2M device image URL
function getDeviceImageUrl(device: Device): string | null {
  const model = device.attributes?.definition?.model;
  const sanitized = sanitizeModelName(model);
  if (!sanitized) return null;
  return `${Z2M_IMAGE_BASE}${sanitized}.png`;
}

interface DeviceImageProps {
  device: Device;
  className?: string;
  iconClassName?: string;
  FallbackIcon?: React.ComponentType<{ className?: string }>;
}

export default function DeviceImage({
  device,
  className = 'h-10 w-10',
  iconClassName = 'h-5 w-5',
  FallbackIcon = Cpu,
}: DeviceImageProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getDeviceImageUrl(device);

  // If no image URL or error loading, show icon fallback
  if (!imageUrl || hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-primary/10 rounded-lg ${className}`}
      >
        <FallbackIcon className={`text-primary ${iconClassName}`} />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={device.name || device.unique_id}
      className={`object-contain ${className}`}
      onError={() => setHasError(true)}
    />
  );
}
