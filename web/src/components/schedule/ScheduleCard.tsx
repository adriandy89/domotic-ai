import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import {
  Edit,
  Power,
  PowerOff,
  Trash2,
  MoreVertical,
  CalendarClock,
  Home,
  Repeat,
  CalendarDays,
  Clock,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type {
  Schedule,
  ScheduleDay,
  ScheduleFrequency,
} from '../../store/useSchedulesStore';
import { useHomesStore } from '../../store/useHomesStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ScheduleCardProps {
  schedule: Schedule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}

const DAY_SHORT: Record<ScheduleDay, string> = {
  SUNDAY: 'Sun',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
};

const FREQ_META: Record<
  ScheduleFrequency,
  { label: string; icon: React.ElementType; color: string }
> = {
  ONCE: {
    label: 'One time',
    icon: Clock,
    color: 'bg-blue-500/10 text-blue-500',
  },
  DAILY: {
    label: 'Daily',
    icon: Repeat,
    color: 'bg-emerald-500/10 text-emerald-500',
  },
  CUSTOM: {
    label: 'Custom days',
    icon: CalendarDays,
    color: 'bg-violet-500/10 text-violet-500',
  },
};

function formatTriggerDate(
  frequency: ScheduleFrequency,
  date?: string | null,
  days?: ScheduleDay[],
): string {
  if (!date) return '—';
  const d = new Date(date);
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (frequency === 'ONCE') {
    return `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })} · ${time}`;
  }
  if (frequency === 'DAILY') {
    return `Every day · ${time}`;
  }
  if (frequency === 'CUSTOM') {
    if (!days || days.length === 0) return `${time} · No days`;
    return `${days.map((day) => DAY_SHORT[day]).join(', ')} · ${time}`;
  }
  return time;
}

export default function ScheduleCard({
  schedule,
  onToggle,
  onDelete,
  onEdit,
}: ScheduleCardProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const { homes } = useHomesStore();

  useEffect(() => {
    if (!showActions) return;
    const onClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showActions]);

  const handleToggle = async () => {
    setIsToggling(true);
    await onToggle(schedule.id, !schedule.active);
    setIsToggling(false);
  };

  const handleDelete = async () => {
    await onDelete(schedule.id);
    setShowDeleteDialog(false);
  };

  const homeName = homes[schedule.home_id]?.name || 'Unknown';
  const freq = FREQ_META[schedule.frequency];
  const FreqIcon = freq.icon;

  return (
    <>
      <Card
        className={cn(
          'bg-card/50 hover:bg-card/70 transition-all duration-300 border-border/50 hover:border-primary/30 group relative h-full flex flex-col',
          schedule.active && 'border-emerald-500/30 hover:border-emerald-500/50',
        )}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground truncate">
                  {schedule.name}
                </h3>
                <div
                  className={cn(
                    'text-xs rounded px-2 py-0.5 flex items-center gap-1',
                    freq.color,
                  )}
                >
                  <FreqIcon className="w-3 h-3" />
                  {freq.label}
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 truncate h-4 flex items-center gap-1.5">
                <CalendarClock className="w-3 h-3 inline" />
                {formatTriggerDate(
                  schedule.frequency,
                  schedule.date,
                  schedule.days,
                )}
              </p>
            </div>

            {/* Actions Menu */}
            <div className="relative" ref={actionsRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowActions(!showActions)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {showActions && (
                <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                  {onEdit && (
                    <button
                      onClick={() => {
                        onEdit(schedule.id);
                        setShowActions(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowDeleteDialog(true);
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-4 pt-2">
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex-1 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-muted-foreground">
                  {schedule._count?.actions ?? 0}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  actions
                </span>
              </div>
              {schedule.frequency === 'CUSTOM' && schedule.days.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground/80">
                  <CalendarDays className="w-3 h-3" />
                  {schedule.days.length} day
                  {schedule.days.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Power Toggle */}
            <Button
              className={cn(
                'w-14 h-14 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300',
                schedule.active
                  ? 'bg-linear-to-b from-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:shadow-[0_0_25px_rgba(52,211,153,0.6)]'
                  : 'bg-linear-to-b from-muted to-muted-foreground/50 opacity-60 hover:opacity-80',
                isToggling && 'opacity-50 scale-95',
              )}
              onClick={handleToggle}
              disabled={isToggling}
              variant="ghost"
            >
              <div className="flex flex-col items-center gap-0.5">
                {schedule.active ? (
                  <Power className="w-5 h-5 text-white" />
                ) : (
                  <PowerOff className="w-5 h-5 text-white" />
                )}
                <span className="text-[10px] text-white font-medium">
                  {schedule.active ? 'ON' : 'OFF'}
                </span>
              </div>
            </Button>
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {schedule.updated_at && (
                <span>
                  Updated{' '}
                  {new Date(schedule.updated_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
              <Home className="w-3 h-3" />
              <span>{homeName}</span>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{schedule.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
