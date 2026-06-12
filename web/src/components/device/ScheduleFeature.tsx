import { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import type { DeviceExpose } from '../../store/useDevicesStore';
import { cn } from '../../lib/utils';
import {
  formatNextOccurrence,
  formatScheduleDays,
  nextScheduleOccurrence,
  parseScheduleValue,
} from '../../lib/schedule-format';

interface ScheduleFeatureProps {
  expose: DeviceExpose;
  value: unknown;
}

function genericText(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

// Read-only renderer for the on-device scheduler array some WiFi firmwares
// publish (e.g. the ESP32 relay): a collapsed one-line summary that expands
// inline to the rule list. Editing isn't wired up — the backend HA adapter has
// no `text` actions yet, so the expose is read-only (see device-capabilities.ts).
export function ScheduleFeature({ expose, value }: ScheduleFeatureProps) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => parseScheduleValue(value), [value]);
  const next = useMemo(
    () => (entries && entries.length > 0 ? nextScheduleOccurrence(entries) : null),
    [entries],
  );
  const label = expose.label || expose.name;

  // Degraded states share one row shell. ValueDisplay isn't reused so the
  // Feature → ScheduleFeature import stays one-directional.
  if (!entries || entries.length === 0) {
    const display =
      value === undefined || value === null
        ? 'N/A'
        : entries
          ? 'No schedules'
          : genericText(value);
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
        <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span
          className="text-xs font-medium text-muted-foreground truncate max-w-[140px]"
          title={
            typeof value === 'object' && value !== null
              ? JSON.stringify(value, null, 2)
              : undefined
          }
        >
          {display}
        </span>
      </div>
    );
  }

  const count = entries.length;

  return (
    <div className="py-1 px-2 bg-background/30 rounded hover:bg-background/50 transition-colors">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        title={open ? 'Collapse schedule' : 'Expand schedule'}
      >
        <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {count} {count === 1 ? 'rule' : 'rules'}
            {next && (
              <>
                <span className="text-muted-foreground"> · next </span>
                <span
                  className={
                    next.entry.action === 'ON'
                      ? 'text-emerald-500'
                      : 'text-foreground'
                  }
                >
                  {formatNextOccurrence(next)}
                </span>
              </>
            )}
          </span>
          {open ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </span>
      </button>

      {open && (
        <div
          className="mt-1 space-y-0.5 max-h-36 overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          {entries.map((entry, i) => (
            <div
              key={entry.id ?? `${entry.time}-${i}`}
              className={cn(
                'flex items-center gap-2 py-0.5 px-1.5 rounded bg-background/40',
                !entry.enabled && 'opacity-40',
              )}
              title={entry.enabled ? undefined : 'Disabled'}
            >
              <span className="text-xs font-mono tabular-nums font-medium text-foreground">
                {entry.time}
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-px rounded uppercase',
                  entry.action === 'ON'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : 'bg-muted/60 text-muted-foreground',
                )}
              >
                {entry.action || '—'}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground truncate">
                {formatScheduleDays(entry.days)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
