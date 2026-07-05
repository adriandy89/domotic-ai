import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Power, Tv } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../../lib/utils';
import { EnumFeature, Feature, NumericFeature } from './Feature';
import type { Device, DeviceExpose } from '../../store/useDevicesStore';
import {
  FeatureAccessMode,
  flattenExposes,
  getDeviceExposes,
} from '../../lib/device-capabilities';

interface TvRemoteModalProps {
  device: Device;
  data: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  onChange: (property: string, value: unknown) => void;
}

/** Properties the remote lays out explicitly (in this order). */
const REMOTE_LAYOUT = ['power', 'volume', 'mute', 'input', 'app'] as const;

/**
 * Remote-control view for media devices (`isMediaDevice`): a prominent power
 * button plus the device's own writable exposes, grouped like a remote. Every
 * control delegates to the existing `Feature` renderers, so command semantics
 * (value_on/off payloads, slider commit-on-release, enum options) stay
 * identical to the card — this modal is presentation only.
 */
export default function TvRemoteModal({
  device,
  data,
  isOpen,
  onClose,
  onChange,
}: TvRemoteModalProps) {
  const { t } = useTranslation();

  const byProp = useMemo(() => {
    const map = new Map<string, DeviceExpose>();
    for (const e of flattenExposes(getDeviceExposes(device))) {
      map.set(e.property, e);
    }
    return map;
  }, [device]);

  const power = byProp.get('power');
  const volume = byProp.get('volume');
  const mute = byProp.get('mute');
  const input = byProp.get('input');
  const app = byProp.get('app');

  // Any other writable expose (future drivers may add channel, source, …).
  const extras = useMemo(
    () =>
      [...byProp.values()].filter(
        (e) =>
          !REMOTE_LAYOUT.includes(e.property as (typeof REMOTE_LAYOUT)[number]) &&
          (e.access & FeatureAccessMode.SET) !== 0,
      ),
    [byProp],
  );

  const powerOn = power?.value_on ?? 'ON';
  const powerOff = power?.value_off ?? 'OFF';
  const isOn = power !== undefined && data[power.property] === powerOn;
  const isMuted = mute !== undefined && data[mute.property] === (mute.value_on ?? 'ON');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            {device.name || device.unique_id}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Power */}
          {power && (
            <div className="flex justify-center">
              <button
                onClick={() => onChange(power.property, isOn ? powerOff : powerOn)}
                title={String(isOn ? powerOff : powerOn)}
                className={cn(
                  'h-16 w-16 rounded-full border-2 flex items-center justify-center transition-all',
                  isOn
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                    : 'border-border bg-background/40 text-muted-foreground hover:border-red-500/60 hover:text-red-500',
                )}
              >
                <Power className="h-7 w-7" />
              </button>
            </div>
          )}

          {/* Volume + mute */}
          {volume && (
            <div className="space-y-1">
              <NumericFeature
                expose={volume}
                value={data[volume.property]}
                onChange={onChange}
              />
              {mute && (
                <button
                  onClick={() =>
                    onChange(
                      mute.property,
                      isMuted ? (mute.value_off ?? 'OFF') : (mute.value_on ?? 'ON'),
                    )
                  }
                  className={cn(
                    'w-full text-xs py-1.5 rounded border transition-colors',
                    isMuted
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-500'
                      : 'border-border/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {mute.label || 'Mute'}: {isMuted ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
          )}

          {/* Source / app pickers */}
          {input && (
            <EnumFeature
              expose={input}
              value={data[input.property]}
              onChange={onChange}
            />
          )}
          {app && (
            <EnumFeature
              expose={app}
              value={data[app.property]}
              onChange={onChange}
            />
          )}

          {extras.map((expose) => (
            <Feature
              key={expose.property}
              expose={expose}
              value={data[expose.property]}
              onChange={onChange}
              data={data}
            />
          ))}

          {!isOn && (
            <p className="text-xs text-muted-foreground text-center">
              {t('devices.remote.offHint')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
