import { useMemo } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export type RangePreset = '24h' | '7d' | '30d' | '90d' | 'ytd';

export interface RangeValue {
  from: Date;
  to: Date;
  preset: RangePreset | 'custom';
}

interface RangeSelectorProps {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
];

export function presetRange(preset: RangePreset): RangeValue {
  const to = new Date();
  const from = new Date(to);
  switch (preset) {
    case '24h':
      from.setHours(from.getHours() - 24);
      break;
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case 'ytd':
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      break;
  }
  return { from, to, preset };
}

export function bucketForRange(range: RangeValue): 'raw' | 'hour' | 'day' {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 2) return 'raw';
  if (days <= 60) return 'hour';
  return 'day';
}

export default function RangeSelector({ value, onChange }: RangeSelectorProps) {
  const fromInput = useMemo(() => toLocalInput(value.from), [value.from]);
  const toInput = useMemo(() => toLocalInput(value.to), [value.to]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-card/40 border border-border p-1">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={value.preset === p.id ? 'default' : 'ghost'}
            onClick={() => onChange(presetRange(p.id))}
            className={cn(
              'h-7 px-2 text-xs',
              value.preset === p.id && 'shadow-sm',
            )}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <input
        type="datetime-local"
        value={fromInput}
        onChange={(e) =>
          onChange({
            from: new Date(e.target.value),
            to: value.to,
            preset: 'custom',
          })
        }
        className="h-8 px-2 text-xs rounded-md border border-border bg-background/50"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="datetime-local"
        value={toInput}
        onChange={(e) =>
          onChange({
            from: value.from,
            to: new Date(e.target.value),
            preset: 'custom',
          })
        }
        className="h-8 px-2 text-xs rounded-md border border-border bg-background/50"
      />
    </div>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
