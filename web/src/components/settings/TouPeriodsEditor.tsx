import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { TouPeriod } from '../../store/usePricingStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // 0=Sunday .. 6=Saturday
const DAY_TITLES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface TouPeriodsEditorProps {
  periods: TouPeriod[];
  onChange: (periods: TouPeriod[]) => void;
  disabled?: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Segments of a period within a single day (handles midnight wrap). */
function segments(p: TouPeriod): Array<[number, number]> {
  const start = toMinutes(p.start);
  const end = toMinutes(p.end);
  if (start < end) return [[start, end]];
  return [
    [start, 1440],
    [0, end],
  ];
}

function findOverlap(periods: TouPeriod[]): string | null {
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i];
      const b = periods[j];
      if (!a.days.some((d) => b.days.includes(d))) continue;
      for (const [as, ae] of segments(a)) {
        for (const [bs, be] of segments(b)) {
          if (as < be && bs < ae) {
            return `"${a.label || `#${i + 1}`}" overlaps "${b.label || `#${j + 1}`}" — the first matching period wins`;
          }
        }
      }
    }
  }
  return null;
}

export default function TouPeriodsEditor({
  periods,
  onChange,
  disabled,
}: TouPeriodsEditorProps) {
  const overlap = useMemo(() => findOverlap(periods), [periods]);

  const update = (index: number, patch: Partial<TouPeriod>) => {
    onChange(periods.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const toggleDay = (index: number, day: number) => {
    const period = periods[index];
    const days = period.days.includes(day)
      ? period.days.filter((d) => d !== day)
      : [...period.days, day].sort((a, b) => a - b);
    if (days.length === 0) return; // at least one day
    update(index, { days });
  };

  const addPeriod = () => {
    onChange([
      ...periods,
      {
        label: `Period ${periods.length + 1}`,
        days: [1, 2, 3, 4, 5],
        start: '00:00',
        end: '08:00',
        price: 0.1,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {periods.map((period, index) => (
        <div
          key={period.id ?? index}
          className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-border/50 bg-background/50"
        >
          <Input
            value={period.label}
            onChange={(e) => update(index, { label: e.target.value })}
            disabled={disabled}
            placeholder="Label"
            className="h-8 w-36 text-sm"
          />
          <div className="flex gap-0.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                title={DAY_TITLES[day]}
                disabled={disabled}
                onClick={() => toggleDay(index, day)}
                className={`w-7 h-7 text-xs rounded-md border transition-colors ${
                  period.days.includes(day)
                    ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                    : 'border-border/50 text-muted-foreground hover:bg-accent/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="time"
            value={period.start}
            onChange={(e) => update(index, { start: e.target.value })}
            disabled={disabled}
            className="h-8 px-2 rounded-md border border-border bg-background/50 text-sm"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="time"
            value={period.end}
            onChange={(e) => update(index, { end: e.target.value })}
            disabled={disabled}
            className="h-8 px-2 rounded-md border border-border bg-background/50 text-sm"
          />
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={period.price}
              onChange={(e) => update(index, { price: Number(e.target.value) })}
              disabled={disabled}
              className="h-8 w-24 text-sm"
            />
            <span className="text-xs text-muted-foreground">/kWh</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || periods.length <= 1}
            onClick={() => onChange(periods.filter((_, i) => i !== index))}
            className="ml-auto h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || periods.length >= 10}
          onClick={addPeriod}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add period
        </Button>
        {overlap && <p className="text-xs text-amber-500">{overlap}</p>}
      </div>
    </div>
  );
}
