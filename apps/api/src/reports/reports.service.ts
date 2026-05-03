import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  ReportAggregateResponseDto,
  ReportBucket,
  ReportMetric,
  ReportMultiSeriesResponseDto,
  ReportSeriesPointDto,
  ReportSeriesResponseDto,
} from '@app/models';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

interface MetricSpec {
  /** Column name in the continuous aggregate to read for the time-series. */
  column: string;
  /** SQL expression for raw queries on `sensor_data.data` JSONB. */
  rawExpr: string;
  /**
   * For accumulating counters (e.g. `energy` in kWh) we compute the consumption
   * per bucket as `MAX(value) - MIN(value)` instead of taking AVG/SUM.
   */
  type: 'avg' | 'count' | 'min' | 'max' | 'counter';
  unit?: string;
}

const METRIC_SPECS: Record<ReportMetric, MetricSpec> = {
  temperature: {
    column: 'temperature_avg',
    rawExpr: `(data->>'temperature')::float`,
    type: 'avg',
    unit: '°C',
  },
  humidity: {
    column: 'humidity_avg',
    rawExpr: `(data->>'humidity')::float`,
    type: 'avg',
    unit: '%',
  },
  pressure: {
    column: 'pressure_avg',
    rawExpr: `(data->>'pressure')::float`,
    type: 'avg',
    unit: 'hPa',
  },
  illuminance: {
    column: 'illuminance_avg',
    rawExpr: `(data->>'illuminance')::float`,
    type: 'avg',
    unit: 'lx',
  },
  power: {
    column: 'power_avg',
    rawExpr: `(data->>'power')::float`,
    type: 'avg',
    unit: 'W',
  },
  energy: {
    column: 'energy_max', // counter: combined with energy_min for delta
    rawExpr: `(data->>'energy')::float`,
    type: 'counter',
    unit: 'kWh',
  },
  voltage: {
    column: 'voltage_avg',
    rawExpr: `(data->>'voltage')::float`,
    type: 'avg',
    unit: 'V',
  },
  current: {
    column: 'current_avg',
    rawExpr: `(data->>'current')::float`,
    type: 'avg',
    unit: 'A',
  },
  contact_open: {
    column: 'contact_open_count',
    rawExpr: `((data->>'contact')::boolean = false)::int`,
    type: 'count',
  },
  occupancy: {
    column: 'occupancy_count',
    rawExpr: `((data->>'occupancy')::boolean = true)::int`,
    type: 'count',
  },
  presence: {
    column: 'presence_count',
    rawExpr: `((data->>'presence')::boolean = true)::int`,
    type: 'count',
  },
  motion: {
    column: 'motion_count',
    rawExpr: `((data->>'motion')::boolean = true)::int`,
    type: 'count',
  },
  vibration: {
    column: 'vibration_count',
    rawExpr: `((data->>'vibration')::boolean = true)::int`,
    type: 'count',
  },
  smoke: {
    column: 'smoke_count',
    rawExpr: `((data->>'smoke')::boolean = true)::int`,
    type: 'count',
  },
  water_leak: {
    column: 'water_leak_count',
    rawExpr: `((data->>'water_leak')::boolean = true)::int`,
    type: 'count',
  },
  tamper: {
    column: 'tamper_count',
    rawExpr: `((data->>'tamper')::boolean = true)::int`,
    type: 'count',
  },
  action: {
    column: 'action_count',
    rawExpr: `(data ? 'action' AND (data->>'action') <> '')::int`,
    type: 'count',
  },
  co2: {
    column: 'co2_avg',
    rawExpr: `(data->>'co2')::float`,
    type: 'avg',
    unit: 'ppm',
  },
  voc: {
    column: 'voc_avg',
    rawExpr: `(data->>'voc')::float`,
    type: 'avg',
    unit: 'ppb',
  },
  pm25: {
    column: 'pm25_avg',
    rawExpr: `(data->>'pm25')::float`,
    type: 'avg',
    unit: 'µg/m³',
  },
  pm10: {
    column: 'pm10_avg',
    rawExpr: `(data->>'pm10')::float`,
    type: 'avg',
    unit: 'µg/m³',
  },
  battery: {
    column: 'battery_min',
    rawExpr: `(data->>'battery')::int`,
    type: 'min',
    unit: '%',
  },
  lqi: {
    column: 'lqi_avg',
    rawExpr: `(data->>'linkquality')::int`,
    type: 'avg',
    unit: 'LQI',
  },
};

interface AggregateRow {
  bucket: Date;
  value: number | null;
  min_value: number | null;
  max_value: number | null;
  sample_count: number | null;
}

const CACHE_TTL_S = 60;
const HOURLY_TABLE = 'sensor_hourly';
const DAILY_TABLE = 'sensor_daily';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly cacheService: CacheService,
  ) {}

  // ---------------------------------------------------------------------------
  //  Authorization helper: ensures the caller owns (via UserHome) the device.
  // ---------------------------------------------------------------------------
  private async assertDeviceAccess(deviceId: string, userId: string) {
    const device = await this.dbService.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        home_id: true,
        organization_id: true,
        home: {
          select: { users: { select: { user_id: true } } },
        },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    const allowed = device.home?.users.some((u) => u.user_id === userId);
    if (!allowed) {
      throw new ForbiddenException('No access to this device');
    }
    return device;
  }

  // ---------------------------------------------------------------------------
  //  Series — one device, one metric, time-bucketed.
  // ---------------------------------------------------------------------------
  async getSeries(
    userId: string,
    params: {
      device_id: string;
      metric: ReportMetric;
      from: Date;
      to: Date;
      bucket?: ReportBucket;
    },
  ): Promise<ReportSeriesResponseDto> {
    await this.assertDeviceAccess(params.device_id, userId);
    const bucket = params.bucket ?? 'hour';
    const spec = METRIC_SPECS[params.metric];
    if (!spec) throw new NotFoundException(`Unknown metric: ${params.metric}`);

    const cacheKey = this.cacheKey('series', params, bucket);
    const cached = await this.cacheService.get<ReportSeriesResponseDto>(cacheKey);
    if (cached) return cached;

    const rows = await this.queryBuckets(spec, bucket, params);
    const points: ReportSeriesPointDto[] = rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      value: this.numberOrNull(r.value),
      min: this.numberOrNull(r.min_value),
      max: this.numberOrNull(r.max_value),
      count: r.sample_count != null ? Number(r.sample_count) : null,
    }));

    const response: ReportSeriesResponseDto = {
      device_id: params.device_id,
      metric: params.metric,
      bucket,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      points,
      unit: spec.unit ?? null,
    };
    await this.cacheService.set(cacheKey, response, CACHE_TTL_S);
    return response;
  }

  async getMultiSeries(
    userId: string,
    params: {
      device_ids: string[];
      metric: ReportMetric;
      from: Date;
      to: Date;
      bucket?: ReportBucket;
    },
  ): Promise<ReportMultiSeriesResponseDto> {
    const series = await Promise.all(
      params.device_ids.map((id) =>
        this.getSeries(userId, {
          device_id: id,
          metric: params.metric,
          from: params.from,
          to: params.to,
          bucket: params.bucket,
        }),
      ),
    );
    return { metric: params.metric, bucket: params.bucket ?? 'hour', series };
  }

  // ---------------------------------------------------------------------------
  //  Aggregate — totals/averages for the period (one device, all metrics).
  // ---------------------------------------------------------------------------
  async getAggregate(
    userId: string,
    params: { device_id: string; from: Date; to: Date },
  ): Promise<ReportAggregateResponseDto> {
    await this.assertDeviceAccess(params.device_id, userId);
    const cacheKey = this.cacheKey('agg', params);
    const cached = await this.cacheService.get<ReportAggregateResponseDto>(cacheKey);
    if (cached) return cached;

    // Pick the cheapest table for the range.
    const table = this.pickTable(this.bucketFromRange(params.from, params.to));

    const rows = await this.dbService.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `
      SELECT
        avg(temperature_avg) AS temperature_avg,
        min(temperature_min) AS temperature_min,
        max(temperature_max) AS temperature_max,
        avg(humidity_avg)    AS humidity_avg,
        avg(pressure_avg)    AS pressure_avg,
        avg(illuminance_avg) AS illuminance_avg,
        avg(power_avg)       AS power_avg,
        max(power_max)       AS power_max,
        max(energy_max) - min(energy_min) AS energy_kwh,
        avg(voltage_avg)     AS voltage_avg,
        avg(current_avg)     AS current_avg,
        sum(contact_open_count) AS contact_open_count,
        sum(occupancy_count)    AS occupancy_count,
        sum(presence_count)     AS presence_count,
        sum(motion_count)       AS motion_count,
        sum(vibration_count)    AS vibration_count,
        sum(smoke_count)        AS smoke_count,
        sum(water_leak_count)   AS water_leak_count,
        sum(tamper_count)       AS tamper_count,
        sum(action_count)       AS action_count,
        avg(co2_avg)         AS co2_avg,
        avg(voc_avg)         AS voc_avg,
        avg(pm25_avg)        AS pm25_avg,
        avg(pm10_avg)        AS pm10_avg,
        min(battery_min)     AS battery_min,
        avg(lqi_avg)         AS lqi_avg,
        sum(sample_count)    AS sample_count
      FROM ${table}
      WHERE device_id = $1::uuid AND bucket >= $2 AND bucket < $3
      `,
      params.device_id,
      params.from,
      params.to,
    );

    const row = rows[0] ?? {};
    const metrics: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(row)) {
      metrics[k] = v == null ? null : Number(v);
    }

    const response: ReportAggregateResponseDto = {
      device_id: params.device_id,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      metrics,
    };
    await this.cacheService.set(cacheKey, response, CACHE_TTL_S);
    return response;
  }

  // ---------------------------------------------------------------------------
  //  Hourly-of-week heatmap (24 × 7) for a counter metric.
  // ---------------------------------------------------------------------------
  async getHeatmap(
    userId: string,
    params: {
      device_id: string;
      metric: ReportMetric;
      from: Date;
      to: Date;
    },
  ): Promise<{ dayOfWeek: number; hour: number; value: number }[]> {
    await this.assertDeviceAccess(params.device_id, userId);
    const spec = METRIC_SPECS[params.metric];
    if (!spec || spec.type !== 'count') {
      throw new NotFoundException(
        `Heatmap is only supported for counter metrics; got ${params.metric}`,
      );
    }
    const cacheKey = this.cacheKey('heat', params);
    const cached =
      await this.cacheService.get<
        Array<{ dayOfWeek: number; hour: number; value: number }>
      >(cacheKey);
    if (cached) return cached;

    const rows = await this.dbService.$queryRawUnsafe<
      Array<{ dow: number; hour: number; total: number }>
    >(
      `
      SELECT
        EXTRACT(DOW FROM bucket)::int  AS dow,
        EXTRACT(HOUR FROM bucket)::int AS hour,
        COALESCE(SUM(${spec.column}), 0)::float AS total
      FROM ${HOURLY_TABLE}
      WHERE device_id = $1::uuid AND bucket >= $2 AND bucket < $3
      GROUP BY dow, hour
      ORDER BY dow, hour
      `,
      params.device_id,
      params.from,
      params.to,
    );

    const result = rows.map((r) => ({
      dayOfWeek: Number(r.dow),
      hour: Number(r.hour),
      value: Number(r.total),
    }));
    await this.cacheService.set(cacheKey, result, CACHE_TTL_S);
    return result;
  }

  // ---------------------------------------------------------------------------
  //  Health snapshot for the org: low battery, weak signal, silent devices.
  // ---------------------------------------------------------------------------
  async getDevicesHealth(
    userId: string,
    organizationId: string,
  ): Promise<{
    devices: Array<{
      device_id: string;
      name: string;
      battery: number | null;
      battery_trend_pct_per_day: number | null;
      lqi_avg: number | null;
      last_seen: string | null;
      uptime_pct_30d: number | null;
    }>;
  }> {
    void userId;
    const cacheKey = `reports:health:${organizationId}`;
    const cached = await this.cacheService.get<{
      devices: Array<{
        device_id: string;
        name: string;
        battery: number | null;
        battery_trend_pct_per_day: number | null;
        lqi_avg: number | null;
        last_seen: string | null;
        uptime_pct_30d: number | null;
      }>;
    }>(cacheKey);
    if (cached) return cached;

    // Last value snapshot from sensor_data_last + name from devices.
    const rows = await this.dbService.$queryRawUnsafe<
      Array<{
        device_id: string;
        name: string;
        battery: number | null;
        last_seen: Date | null;
      }>
    >(
      `
      SELECT
        d.id   AS device_id,
        d.name AS name,
        ((sdl.data->>'battery')::int) AS battery,
        sdl."timestamp"               AS last_seen
      FROM devices d
      LEFT JOIN sensor_data_last sdl ON sdl.device_id = d.id
      WHERE d.organization_id = $1
        AND d.disabled = false
      ORDER BY d.name ASC
      `,
      organizationId,
    );

    // For each device, compute battery trend over last 30 days using
    // sensor_daily.battery_min linear regression (slope).
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const devices = await Promise.all(
      rows.map(async (r) => {
        const trend = await this.dbService.$queryRawUnsafe<
          Array<{ slope: number | null; lqi: number | null; days: number }>
        >(
          `
          WITH series AS (
            SELECT
              EXTRACT(EPOCH FROM bucket)/86400 AS x,
              battery_min::float AS y,
              lqi_avg::float AS lqi
            FROM ${DAILY_TABLE}
            WHERE device_id = $1::uuid
              AND bucket >= $2
              AND battery_min IS NOT NULL
          )
          SELECT
            CASE WHEN count(*) > 1 THEN regr_slope(y, x) ELSE NULL END AS slope,
            avg(lqi) AS lqi,
            count(*)::int AS days
          FROM series
          `,
          r.device_id,
          since,
        );

        // Uptime = % of hours with at least one sample.
        const uptime = await this.dbService.$queryRawUnsafe<
          Array<{ pct: number | null }>
        >(
          `
          WITH expected AS (
            SELECT GREATEST(1, EXTRACT(EPOCH FROM (now() - $2))/3600)::int AS hours
          ),
          observed AS (
            SELECT count(*)::int AS hours
            FROM ${HOURLY_TABLE}
            WHERE device_id = $1::uuid
              AND bucket >= $2
              AND sample_count > 0
          )
          SELECT (observed.hours::float / expected.hours::float) * 100 AS pct
          FROM expected, observed
          `,
          r.device_id,
          since,
        );

        return {
          device_id: r.device_id,
          name: r.name,
          battery: r.battery == null ? null : Number(r.battery),
          battery_trend_pct_per_day:
            trend[0]?.slope == null ? null : Number(trend[0].slope),
          lqi_avg: trend[0]?.lqi == null ? null : Number(trend[0].lqi),
          last_seen: r.last_seen ? r.last_seen.toISOString() : null,
          uptime_pct_30d: uptime[0]?.pct == null ? null : Number(uptime[0].pct),
        };
      }),
    );

    const result = { devices };
    await this.cacheService.set(cacheKey, result, CACHE_TTL_S);
    return result;
  }

  // ---------------------------------------------------------------------------
  //  Automations report — daily counts of rule executions and command sources.
  // ---------------------------------------------------------------------------
  async getAutomationsReport(
    userId: string,
    organizationId: string,
    range: { from: Date; to: Date },
  ): Promise<{
    rule_executions_daily: { day: string; conditions_met: number; executed: number }[];
    rule_top: { rule_id: string; name: string; executions: number }[];
    commands_by_source_daily: {
      day: string;
      api: number;
      ai: number;
      rule: number;
      schedule: number;
    }[];
    commands_top_devices: {
      device_id: string;
      name: string;
      commands: number;
    }[];
    totals: {
      rule_executions: number;
      rule_executions_failed: number;
      commands_total: number;
      commands_failed: number;
    };
  }> {
    void userId;
    const cacheKey = `reports:auto:${organizationId}:${range.from.toISOString()}:${range.to.toISOString()}`;
    const cached = await this.cacheService.get<{
      rule_executions_daily: { day: string; conditions_met: number; executed: number }[];
      rule_top: { rule_id: string; name: string; executions: number }[];
      commands_by_source_daily: {
        day: string;
        api: number;
        ai: number;
        rule: number;
        schedule: number;
      }[];
      commands_top_devices: {
        device_id: string;
        name: string;
        commands: number;
      }[];
      totals: {
        rule_executions: number;
        rule_executions_failed: number;
        commands_total: number;
        commands_failed: number;
      };
    }>(cacheKey);
    if (cached) return cached;

    const ruleDailyRows = await this.dbService.$queryRawUnsafe<
      Array<{ day: Date; conditions_met: number; executed: number }>
    >(
      `
      SELECT
        date_trunc('day', re.triggered_at)::timestamptz AS day,
        sum((re.conditions_met)::int)::int AS conditions_met,
        sum((re.executed)::int)::int       AS executed
      FROM rule_executions re
      JOIN rules r ON r.id = re.rule_id
      JOIN homes h ON h.id = r.home_id
      WHERE h.organization_id = $1
        AND re.triggered_at >= $2 AND re.triggered_at < $3
      GROUP BY day
      ORDER BY day ASC
      `,
      organizationId,
      range.from,
      range.to,
    );

    const ruleTopRows = await this.dbService.$queryRawUnsafe<
      Array<{ rule_id: string; name: string; executions: number }>
    >(
      `
      SELECT
        r.id   AS rule_id,
        r.name AS name,
        count(re.*)::int AS executions
      FROM rule_executions re
      JOIN rules r ON r.id = re.rule_id
      JOIN homes h ON h.id = r.home_id
      WHERE h.organization_id = $1
        AND re.triggered_at >= $2 AND re.triggered_at < $3
      GROUP BY r.id, r.name
      ORDER BY executions DESC
      LIMIT 10
      `,
      organizationId,
      range.from,
      range.to,
    );

    const cmdDailyRows = await this.dbService.$queryRawUnsafe<
      Array<{
        day: Date;
        api: number;
        ai: number;
        rule: number;
        schedule: number;
      }>
    >(
      `
      SELECT
        date_trunc('day', ce.sent_at)::timestamptz AS day,
        sum(case when ce.source = 'api' then 1 else 0 end)::int      AS api,
        sum(case when ce.source = 'ai' then 1 else 0 end)::int       AS ai,
        sum(case when ce.source = 'rule' then 1 else 0 end)::int     AS rule,
        sum(case when ce.source = 'schedule' then 1 else 0 end)::int AS schedule
      FROM command_executions ce
      JOIN devices d ON d.id = ce.device_id
      WHERE d.organization_id = $1
        AND ce.sent_at >= $2 AND ce.sent_at < $3
      GROUP BY day
      ORDER BY day ASC
      `,
      organizationId,
      range.from,
      range.to,
    );

    const cmdTopRows = await this.dbService.$queryRawUnsafe<
      Array<{ device_id: string; name: string; commands: number }>
    >(
      `
      SELECT d.id AS device_id, d.name AS name, count(ce.*)::int AS commands
      FROM command_executions ce
      JOIN devices d ON d.id = ce.device_id
      WHERE d.organization_id = $1
        AND ce.sent_at >= $2 AND ce.sent_at < $3
      GROUP BY d.id, d.name
      ORDER BY commands DESC
      LIMIT 10
      `,
      organizationId,
      range.from,
      range.to,
    );

    const totalsRows = await this.dbService.$queryRawUnsafe<
      Array<{
        rule_executions: number;
        rule_executions_failed: number;
        commands_total: number;
        commands_failed: number;
      }>
    >(
      `
      SELECT
        (SELECT count(*)::int FROM rule_executions re
           JOIN rules r ON r.id = re.rule_id
           JOIN homes h ON h.id = r.home_id
           WHERE h.organization_id = $1
             AND re.triggered_at >= $2 AND re.triggered_at < $3) AS rule_executions,
        (SELECT count(*)::int FROM rule_executions re
           JOIN rules r ON r.id = re.rule_id
           JOIN homes h ON h.id = r.home_id
           WHERE h.organization_id = $1
             AND re.triggered_at >= $2 AND re.triggered_at < $3
             AND re.error IS NOT NULL) AS rule_executions_failed,
        (SELECT count(*)::int FROM command_executions ce
           JOIN devices d ON d.id = ce.device_id
           WHERE d.organization_id = $1
             AND ce.sent_at >= $2 AND ce.sent_at < $3) AS commands_total,
        (SELECT count(*)::int FROM command_executions ce
           JOIN devices d ON d.id = ce.device_id
           WHERE d.organization_id = $1
             AND ce.sent_at >= $2 AND ce.sent_at < $3
             AND ce.ok = false) AS commands_failed
      `,
      organizationId,
      range.from,
      range.to,
    );

    const result = {
      rule_executions_daily: ruleDailyRows.map((r) => ({
        day: r.day.toISOString(),
        conditions_met: Number(r.conditions_met),
        executed: Number(r.executed),
      })),
      rule_top: ruleTopRows.map((r) => ({
        rule_id: r.rule_id,
        name: r.name,
        executions: Number(r.executions),
      })),
      commands_by_source_daily: cmdDailyRows.map((r) => ({
        day: r.day.toISOString(),
        api: Number(r.api),
        ai: Number(r.ai),
        rule: Number(r.rule),
        schedule: Number(r.schedule),
      })),
      commands_top_devices: cmdTopRows.map((r) => ({
        device_id: r.device_id,
        name: r.name,
        commands: Number(r.commands),
      })),
      totals: {
        rule_executions: Number(totalsRows[0]?.rule_executions ?? 0),
        rule_executions_failed: Number(
          totalsRows[0]?.rule_executions_failed ?? 0,
        ),
        commands_total: Number(totalsRows[0]?.commands_total ?? 0),
        commands_failed: Number(totalsRows[0]?.commands_failed ?? 0),
      },
    };
    await this.cacheService.set(cacheKey, result, CACHE_TTL_S);
    return result;
  }

  // ---------------------------------------------------------------------------
  //  AI usage report — token usage per provider/model and per day.
  // ---------------------------------------------------------------------------
  async getAiUsageReport(
    userId: string,
    organizationId: string,
    range: { from: Date; to: Date },
  ): Promise<{
    daily: { day: string; total_tokens: number; calls: number }[];
    by_provider: {
      provider: string;
      total_tokens: number;
      calls: number;
      avg_latency_ms: number;
    }[];
    by_model: { model: string; total_tokens: number; calls: number }[];
    totals: {
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
      tool_calls: number;
      conversations: number;
      errors: number;
      avg_latency_ms: number;
      p95_latency_ms: number;
    };
  }> {
    void userId;
    const cacheKey = `reports:ai:${organizationId}:${range.from.toISOString()}:${range.to.toISOString()}`;
    const cached = await this.cacheService.get<{
      daily: { day: string; total_tokens: number; calls: number }[];
      by_provider: {
        provider: string;
        total_tokens: number;
        calls: number;
        avg_latency_ms: number;
      }[];
      by_model: { model: string; total_tokens: number; calls: number }[];
      totals: {
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
        tool_calls: number;
        conversations: number;
        errors: number;
        avg_latency_ms: number;
        p95_latency_ms: number;
      };
    }>(cacheKey);
    if (cached) return cached;

    const dailyRows = await this.dbService.$queryRawUnsafe<
      Array<{ day: Date; total_tokens: number; calls: number }>
    >(
      `
      SELECT
        date_trunc('day', created_at)::timestamptz AS day,
        sum(total_tokens)::int  AS total_tokens,
        count(*)::int           AS calls
      FROM ai_usage
      WHERE organization_id = $1
        AND created_at >= $2 AND created_at < $3
      GROUP BY day
      ORDER BY day ASC
      `,
      organizationId,
      range.from,
      range.to,
    );

    const providerRows = await this.dbService.$queryRawUnsafe<
      Array<{
        provider: string;
        total_tokens: number;
        calls: number;
        avg_latency_ms: number;
      }>
    >(
      `
      SELECT
        provider,
        sum(total_tokens)::int  AS total_tokens,
        count(*)::int           AS calls,
        avg(latency_ms)::int    AS avg_latency_ms
      FROM ai_usage
      WHERE organization_id = $1
        AND created_at >= $2 AND created_at < $3
      GROUP BY provider
      ORDER BY total_tokens DESC
      `,
      organizationId,
      range.from,
      range.to,
    );

    const modelRows = await this.dbService.$queryRawUnsafe<
      Array<{ model: string; total_tokens: number; calls: number }>
    >(
      `
      SELECT model, sum(total_tokens)::int AS total_tokens, count(*)::int AS calls
      FROM ai_usage
      WHERE organization_id = $1
        AND created_at >= $2 AND created_at < $3
      GROUP BY model
      ORDER BY total_tokens DESC
      LIMIT 10
      `,
      organizationId,
      range.from,
      range.to,
    );

    const totalsRows = await this.dbService.$queryRawUnsafe<
      Array<{
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
        tool_calls: number;
        conversations: number;
        errors: number;
        avg_latency_ms: number;
        p95_latency_ms: number;
      }>
    >(
      `
      SELECT
        coalesce(sum(total_tokens),0)::int      AS total_tokens,
        coalesce(sum(prompt_tokens),0)::int     AS prompt_tokens,
        coalesce(sum(completion_tokens),0)::int AS completion_tokens,
        coalesce(sum(tool_calls),0)::int        AS tool_calls,
        count(distinct conversation_id)::int    AS conversations,
        sum(case when error is not null then 1 else 0 end)::int AS errors,
        coalesce(avg(latency_ms),0)::int        AS avg_latency_ms,
        coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::int AS p95_latency_ms
      FROM ai_usage
      WHERE organization_id = $1
        AND created_at >= $2 AND created_at < $3
      `,
      organizationId,
      range.from,
      range.to,
    );

    const result = {
      daily: dailyRows.map((r) => ({
        day: r.day.toISOString(),
        total_tokens: Number(r.total_tokens),
        calls: Number(r.calls),
      })),
      by_provider: providerRows.map((r) => ({
        provider: r.provider,
        total_tokens: Number(r.total_tokens),
        calls: Number(r.calls),
        avg_latency_ms: Number(r.avg_latency_ms),
      })),
      by_model: modelRows.map((r) => ({
        model: r.model,
        total_tokens: Number(r.total_tokens),
        calls: Number(r.calls),
      })),
      totals: {
        total_tokens: Number(totalsRows[0]?.total_tokens ?? 0),
        prompt_tokens: Number(totalsRows[0]?.prompt_tokens ?? 0),
        completion_tokens: Number(totalsRows[0]?.completion_tokens ?? 0),
        tool_calls: Number(totalsRows[0]?.tool_calls ?? 0),
        conversations: Number(totalsRows[0]?.conversations ?? 0),
        errors: Number(totalsRows[0]?.errors ?? 0),
        avg_latency_ms: Number(totalsRows[0]?.avg_latency_ms ?? 0),
        p95_latency_ms: Number(totalsRows[0]?.p95_latency_ms ?? 0),
      },
    };
    await this.cacheService.set(cacheKey, result, CACHE_TTL_S);
    return result;
  }

  // ---------------------------------------------------------------------------
  //  CSV stream — yields rows the controller pipes to the response.
  // ---------------------------------------------------------------------------
  async *streamCsv(
    userId: string,
    params: {
      device_id: string;
      metric: ReportMetric;
      from: Date;
      to: Date;
      bucket?: ReportBucket;
    },
  ): AsyncGenerator<string> {
    const series = await this.getSeries(userId, params);
    yield `bucket,value,min,max,count\n`;
    for (const p of series.points) {
      yield `${p.bucket},${csvNum(p.value)},${csvNum(p.min)},${csvNum(p.max)},${csvNum(p.count)}\n`;
    }
  }

  // ---------------------------------------------------------------------------
  //  Internal helpers
  // ---------------------------------------------------------------------------

  /** Decide which table to read from given the requested bucket. */
  private pickTable(bucket: ReportBucket): string {
    if (bucket === 'day') return DAILY_TABLE;
    return HOURLY_TABLE; // 'hour' is the canonical aggregate; 'raw' is handled separately.
  }

  /** Heuristic: choose a sensible default bucket when only `from`/`to` are known. */
  private bucketFromRange(from: Date, to: Date): ReportBucket {
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days > 60) return 'day';
    return 'hour';
  }

  private async queryBuckets(
    spec: MetricSpec,
    bucket: ReportBucket,
    params: { device_id: string; from: Date; to: Date },
  ): Promise<AggregateRow[]> {
    if (bucket === 'raw') {
      // Read directly from `sensor_data` — only safe for short ranges.
      // Limit to 5000 points to protect the API.
      return await this.dbService.$queryRawUnsafe<AggregateRow[]>(
        `
        SELECT
          timestamp AS bucket,
          ${spec.rawExpr} AS value,
          NULL::float AS min_value,
          NULL::float AS max_value,
          NULL::int   AS sample_count
        FROM sensor_data
        WHERE device_id = $1::uuid
          AND timestamp >= $2 AND timestamp < $3
          AND data ? '${spec.rawExpr.match(/data->>'(\w+)'/)?.[1] ?? ''}'
        ORDER BY timestamp ASC
        LIMIT 5000
        `,
        params.device_id,
        params.from,
        params.to,
      );
    }

    const table = this.pickTable(bucket);

    if (spec.type === 'counter') {
      // Energy (kWh): per-bucket consumption is the diff between the bucket's
      // own MAX-MIN of the cumulative counter.
      return await this.dbService.$queryRawUnsafe<AggregateRow[]>(
        `
        SELECT
          bucket AS bucket,
          (energy_max - energy_min) AS value,
          energy_min AS min_value,
          energy_max AS max_value,
          sample_count
        FROM ${table}
        WHERE device_id = $1::uuid
          AND bucket >= $2 AND bucket < $3
          AND energy_max IS NOT NULL
        ORDER BY bucket ASC
        `,
        params.device_id,
        params.from,
        params.to,
      );
    }

    // Generic avg/min/max/count metric → read the column straight from the aggregate.
    return await this.dbService.$queryRawUnsafe<AggregateRow[]>(
      `
      SELECT
        bucket AS bucket,
        ${spec.column} AS value,
        NULL::float AS min_value,
        NULL::float AS max_value,
        sample_count
      FROM ${table}
      WHERE device_id = $1::uuid
        AND bucket >= $2 AND bucket < $3
        AND ${spec.column} IS NOT NULL
      ORDER BY bucket ASC
      `,
      params.device_id,
      params.from,
      params.to,
    );
  }

  private numberOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private cacheKey(prefix: string, params: object, ...extra: string[]): string {
    return `reports:${prefix}:${JSON.stringify(params)}:${extra.join(':')}`;
  }
}

function csvNum(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}
