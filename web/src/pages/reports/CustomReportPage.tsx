import { useEffect, useMemo, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import {
  bucketForRange,
  presetRange,
  RangeSelector,
  TimeSeriesChart,
  type RangeValue,
} from '../../components/charts';
import DeviceSelector from '../../components/reports/DeviceSelector';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { useDevicesStore } from '../../store/useDevicesStore';
import { useHomesStore } from '../../store/useHomesStore';
import {
  getDeviceExposes,
  flattenExposes,
} from '../../lib/device-capabilities';
import {
  useReportsStore,
  type FieldSeriesResponse,
  type StateEvent,
} from '../../store/useReportsStore';
import { cn } from '../../lib/utils';

const SERIES_COLORS = [
  '#22d3ee',
  '#f59e0b',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#3b82f6',
  '#eab308',
  '#14b8a6',
];

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** Badge tint for a logbook state value (ON/true green, OFF/false muted). */
function stateBadgeClass(value: string): string {
  const v = value.toLowerCase();
  if (v === 'on' || v === 'true') return 'bg-emerald-500/15 text-emerald-500';
  if (v === 'off' || v === 'false') return 'bg-muted text-muted-foreground';
  return 'bg-primary/10 text-primary';
}

interface FieldOption {
  field: string;
  label: string;
  unit?: string;
}

/**
 * Custom report: chart ANY numeric variable of any device from the generic
 * per-field statistics (sensor_field_hourly/daily), plus the device's
 * state-change logbook (device_state_events) — covering the HA-Discovery
 * variables that have no fixed report metric (leq_db, band_*, zcr, …).
 */
export default function CustomReportPage() {
  const { devices, devicesData } = useDevicesStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchFieldSeries, fetchStateEvents } = useReportsStore();

  const [homeId, setHomeId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>(presetRange('7d'));

  const device = deviceId ? devices[deviceId] : null;
  const last = deviceId ? devicesData[deviceId]?.data : undefined;

  // Every numeric variable the device reports: numeric exposes (state_class /
  // unit driven) plus payload keys whose last value is a number, so fields
  // without discovery metadata are still queryable.
  const fieldOptions = useMemo(() => {
    if (!device) return [] as FieldOption[];
    const seen = new Set<string>();
    const out: FieldOption[] = [];
    for (const e of flattenExposes(getDeviceExposes(device))) {
      const prop = e.property ?? e.name;
      if (!prop || seen.has(prop)) continue;
      if (
        prop === 'ts' ||
        prop === 'timestamp' ||
        e.device_class === 'timestamp'
      )
        continue;
      const lastValue = last?.[prop];
      const numeric =
        e.type === 'numeric' ||
        typeof lastValue === 'number' ||
        (typeof lastValue === 'string' &&
          NUMERIC_TEXT.test(lastValue.trim()));
      if (!numeric) continue;
      seen.add(prop);
      out.push({ field: prop, label: e.label || prop, unit: e.unit });
    }
    if (last) {
      for (const [k, v] of Object.entries(last)) {
        if (seen.has(k) || k === 'ts' || k === 'timestamp') continue;
        if (typeof v !== 'number') continue;
        seen.add(k);
        out.push({ field: k, label: k });
      }
    }
    return out;
  }, [device, last]);

  // Selected variables — derived: defaults to the first 4 of the device until
  // the user toggles chips (per-device override, resets on device change).
  const [selectedOverride, setSelectedOverride] = useState<{
    deviceId: string;
    fields: string[];
  } | null>(null);

  const selectedFields = useMemo(
    () =>
      selectedOverride?.deviceId === deviceId
        ? selectedOverride.fields
        : fieldOptions.slice(0, 4).map((f) => f.field),
    [selectedOverride, deviceId, fieldOptions],
  );

  const toggleField = (field: string) => {
    if (!deviceId) return;
    setSelectedOverride({
      deviceId,
      fields: selectedFields.includes(field)
        ? selectedFields.filter((f) => f !== field)
        : [...selectedFields, field],
    });
  };

  // Series per selected field (generic field statistics). Keyed by
  // device+fields so charts never show another device's stale data.
  const fieldsKey = selectedFields.join(',');
  const seriesKey = `${deviceId ?? ''}:${fieldsKey}`;
  const [seriesState, setSeriesState] = useState<{
    key: string;
    map: Record<string, FieldSeriesResponse | null>;
  } | null>(null);

  useEffect(() => {
    if (!deviceId || !fieldsKey) return;
    let cancelled = false;
    const bucket = bucketForRange(range);
    const key = `${deviceId}:${fieldsKey}`;
    Promise.all(
      fieldsKey.split(',').map(async (field) => {
        const s = await fetchFieldSeries({
          device_id: deviceId,
          field,
          from: range.from,
          to: range.to,
          bucket,
        });
        return [field, s] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, FieldSeriesResponse | null> = {};
      for (const [k, v] of entries) map[k] = v;
      setSeriesState({ key, map });
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId, fieldsKey, range, fetchFieldSeries]);

  const seriesByField = seriesState?.key === seriesKey ? seriesState.map : {};
  const isLoadingSeries =
    Boolean(deviceId && fieldsKey) && seriesState?.key !== seriesKey;

  // State-change logbook for the device in the same range. Keyed by device so
  // a stale list never renders for another device; the property filter is
  // derived-valid (an unknown property falls back to "All").
  const [eventsState, setEventsState] = useState<{
    deviceId: string;
    events: StateEvent[];
  } | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    fetchStateEvents({
      device_id: deviceId,
      from: range.from,
      to: range.to,
    }).then((res) =>
      setEventsState({ deviceId, events: res?.events ?? [] }),
    );
  }, [deviceId, range, fetchStateEvents]);

  const stateEvents = useMemo(
    () => (eventsState?.deviceId === deviceId ? eventsState.events : []),
    [eventsState, deviceId],
  );

  const eventProperties = useMemo(
    () => [...new Set(stateEvents.map((e) => e.property))],
    [stateEvents],
  );

  const activeEventFilter =
    eventFilter && eventProperties.includes(eventFilter) ? eventFilter : null;

  const eventsByDay = useMemo(() => {
    const groups: { day: string; events: StateEvent[] }[] = [];
    for (const ev of stateEvents) {
      if (activeEventFilter && ev.property !== activeEventFilter) continue;
      const day = new Date(ev.timestamp).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.day === day) lastGroup.events.push(ev);
      else groups.push({ day, events: [ev] });
    }
    return groups;
  }, [stateEvents, activeEventFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Home
          </label>
          <select
            value={homeId ?? ''}
            onChange={(e) => setHomeId(e.target.value || null)}
            className="h-9 px-3 rounded-md border border-border bg-background/50 text-sm"
          >
            <option value="">All homes</option>
            {homeIds.map((id) => (
              <option key={id} value={id}>
                {homes[id]?.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Device
          </label>
          <DeviceSelector
            value={deviceId}
            onChange={setDeviceId}
            homeId={homeId}
            placeholder="Pick a device"
          />
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {!device ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Pick a device to chart any of its variables
        </p>
      ) : (
        <>
          <Card className="bg-card/40 border-border">
            <CardHeader>
              <CardTitle className="text-base">Variables</CardTitle>
            </CardHeader>
            <CardContent>
              {fieldOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This device reports no numeric variables
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {fieldOptions.map((f) => {
                    const active = selectedFields.includes(f.field);
                    return (
                      <button
                        key={f.field}
                        onClick={() => toggleField(f.field)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs border transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {f.label}
                        {f.unit && (
                          <span className="text-muted-foreground ml-1">
                            ({f.unit})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {selectedFields.map((field, i) => {
              const opt = fieldOptions.find((f) => f.field === field);
              const s = seriesByField[field];
              const unit = opt?.unit ?? s?.unit ?? undefined;
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              return (
                <Card key={field} className="bg-card/40 border-border">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {opt?.label ?? field}
                      {unit && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({unit})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimeSeriesChart
                      data={(s?.points ?? []).map((p) => ({
                        bucket: p.bucket,
                        [field]: p.value,
                      }))}
                      series={[
                        { key: field, label: opt?.label ?? field, unit, color },
                      ]}
                      yUnit={unit}
                      height={220}
                      type="area"
                      isLoading={isLoadingSeries}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {stateEvents.length > 0 && (
            <Card className="bg-card/40 border-border">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" />
                  State history
                </CardTitle>
                {eventProperties.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setEventFilter(null)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs border transition-colors',
                        activeEventFilter === null
                          ? 'border-primary text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      All
                    </button>
                    {eventProperties.map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          setEventFilter(activeEventFilter === p ? null : p)
                        }
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs border transition-colors',
                          activeEventFilter === p
                            ? 'border-primary text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {eventsByDay.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {eventsByDay.map((group) => (
                      <div key={group.day}>
                        <p className="text-xs font-medium text-muted-foreground border-b border-border pb-1 mb-1">
                          {group.day}
                        </p>
                        <div className="divide-y divide-border/50">
                          {group.events.map((ev, i) => (
                            <div
                              key={`${ev.timestamp}-${ev.property}-${i}`}
                              className="flex items-center gap-3 py-1.5 text-sm"
                            >
                              <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">
                                {new Date(ev.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                              <span className="font-medium w-28 truncate shrink-0">
                                {ev.property}
                              </span>
                              {ev.prev_value != null && (
                                <>
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded-full text-xs',
                                      stateBadgeClass(ev.prev_value),
                                    )}
                                  >
                                    {ev.prev_value}
                                  </span>
                                  <span className="text-muted-foreground text-xs">
                                    →
                                  </span>
                                </>
                              )}
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-xs',
                                  stateBadgeClass(ev.value),
                                )}
                              >
                                {ev.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
