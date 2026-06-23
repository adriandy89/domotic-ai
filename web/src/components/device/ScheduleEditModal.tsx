import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import {
  DAY_MASKS,
  parseScheduleValue,
  SCHEDULE_DAY_OPTIONS,
  SCHEDULE_MAX_ENTRIES,
  toggleDay,
  hasDay,
  type ScheduleEntry,
} from '../../lib/schedule-format';

interface ScheduleEditModalProps {
  onClose: () => void;
  /** Optional label shown in the header to identify the device/property. */
  deviceLabel?: string;
  /** Current raw schedule value (array or JSON string). */
  value: unknown;
  /** Called with the full replacement schedule when the user saves. */
  onSave: (entries: ScheduleEntry[]) => void;
}

/** A rule being edited; `uid` is a stable React key (ids are reassigned on save). */
interface DraftRule {
  uid: string;
  days: number;
  time: string;
  action: 'ON' | 'OFF';
  enabled: boolean;
}

let uidSeq = 0;
const nextUid = () => `r${uidSeq++}`;

function toDraft(entry: ScheduleEntry): DraftRule {
  return {
    uid: nextUid(),
    days: entry.days,
    time: entry.time,
    action: entry.action === 'OFF' ? 'OFF' : 'ON',
    enabled: entry.enabled,
  };
}

/** jsDay (0=Sun..6=Sat) → i18n short-name key. */
const DAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Full editor for the on-device scheduler. Each save replaces the entire array
// on the firmware, so the modal always sends the complete (reindexed) list.
export function ScheduleEditModal({
  onClose,
  deviceLabel,
  value,
  onSave,
}: ScheduleEditModalProps) {
  const { t } = useTranslation();
  // Seeded once from the live value — the parent mounts this only while editing,
  // so a fresh open always starts from the current schedule.
  const [rules, setRules] = useState<DraftRule[]>(() =>
    (parseScheduleValue(value) ?? []).map(toDraft),
  );

  const atMax = rules.length >= SCHEDULE_MAX_ENTRIES;

  const patchRule = (uid: string, patch: Partial<DraftRule>) =>
    setRules((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const addRule = () => {
    if (atMax) return;
    setRules((rs) => [
      ...rs,
      {
        uid: nextUid(),
        days: DAY_MASKS.everyDay,
        time: '08:00',
        action: 'ON',
        enabled: true,
      },
    ]);
  };

  const removeRule = (uid: string) =>
    setRules((rs) => rs.filter((r) => r.uid !== uid));

  const handleSave = () => {
    const entries: ScheduleEntry[] = rules.map((r, i) => ({
      id: i + 1,
      days: r.days,
      time: r.time,
      action: r.action,
      enabled: r.enabled,
    }));
    onSave(entries);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t('devices.schedule.editTitle')}</DialogTitle>
          <DialogDescription>
            {deviceLabel && `${deviceLabel} · `}
            {t('devices.schedule.editSubtitle', { count: SCHEDULE_MAX_ENTRIES })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('devices.schedule.emptyRules')}
            </p>
          )}

          {rules.map((rule) => (
            <div
              key={rule.uid}
              className={cn(
                'rounded-lg border border-border/60 bg-background/40 p-3 space-y-3',
                !rule.enabled && 'opacity-60',
              )}
            >
              {/* Row 1: time, ON/OFF, enabled, delete */}
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={rule.time}
                  onChange={(e) =>
                    patchRule(rule.uid, { time: e.target.value })
                  }
                  className="h-9 w-28 font-mono tabular-nums"
                />

                <div className="flex rounded-md border border-input overflow-hidden">
                  {(['ON', 'OFF'] as const).map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => patchRule(rule.uid, { action: act })}
                      className={cn(
                        'px-3 h-9 text-xs font-semibold transition-colors',
                        rule.action === act
                          ? act === 'ON'
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-accent/40',
                      )}
                    >
                      {t(`devices.schedule.${act === 'ON' ? 'on' : 'off'}`)}
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(c) =>
                      patchRule(rule.uid, { enabled: c })
                    }
                    aria-label={t('devices.schedule.enabled')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRule(rule.uid)}
                    title={t('devices.schedule.deleteRule')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Row 2: day toggles + presets */}
              <div className="flex flex-wrap items-center gap-1">
                {SCHEDULE_DAY_OPTIONS.map(({ jsDay }) => {
                  const on = hasDay(rule.days, jsDay);
                  return (
                    <button
                      key={jsDay}
                      type="button"
                      onClick={() =>
                        patchRule(rule.uid, {
                          days: toggleDay(rule.days, jsDay),
                        })
                      }
                      className={cn(
                        'h-7 min-w-9 px-1.5 rounded-md text-[11px] font-medium transition-colors',
                        on
                          ? 'bg-primary/20 text-primary'
                          : 'bg-background/60 text-muted-foreground hover:bg-accent/40',
                      )}
                    >
                      {t(`devices.schedule.dayShort.${DAY_KEY[jsDay]}`)}
                    </button>
                  );
                })}
                <span className="mx-1 h-4 w-px bg-border" />
                <PresetButton
                  label={t('devices.schedule.presetAll')}
                  onClick={() => patchRule(rule.uid, { days: DAY_MASKS.everyDay })}
                />
                <PresetButton
                  label={t('devices.schedule.presetWeekdays')}
                  onClick={() => patchRule(rule.uid, { days: DAY_MASKS.weekdays })}
                />
                <PresetButton
                  label={t('devices.schedule.presetWeekend')}
                  onClick={() => patchRule(rule.uid, { days: DAY_MASKS.weekend })}
                />
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRule}
          disabled={atMax}
          className="w-full"
          title={atMax ? t('devices.schedule.maxRules', { count: SCHEDULE_MAX_ENTRIES }) : undefined}
        >
          <Plus className="h-4 w-4 mr-1" />
          {atMax
            ? t('devices.schedule.maxRules', { count: SCHEDULE_MAX_ENTRIES })
            : t('devices.schedule.addRule')}
        </Button>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('devices.schedule.cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {t('devices.schedule.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresetButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2 rounded-md text-[11px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
    >
      {label}
    </button>
  );
}
