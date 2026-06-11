import { DbService } from '@app/db';
import { PricingSource } from '@app/models';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  ElectricityPriceProvider,
  PRICE_PROVIDERS,
} from './providers/price-provider.interface';
import {
  addDays,
  groupPointsToHourly,
  isoDay,
  zonedDayStartUtc,
} from './time.util';

interface FetchTarget {
  source: string;
  zone: string;
}

/**
 * Keeps `electricity_prices` filled for every (provider, zone) referenced by
 * a DYNAMIC home. Three idempotent mechanisms share ensureDay() upserts:
 *
 *  1. 20:35 Europe/Madrid — fetch tomorrow (PVPC publishes ~20:15 CET).
 *  2. Hourly reconcile — refetch any incomplete day in [today-2 .. tomorrow];
 *     this is also the retry path when the 20:35 run failed.
 *  3. Bootstrap backfill — last PRICING_BACKFILL_DAYS (default 30) so a fresh
 *     deploy can cost past consumption.
 */
@Injectable()
export class PriceFetchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PriceFetchService.name);
  private readonly backfillDays: number;

  constructor(
    private readonly db: DbService,
    @Inject(PRICE_PROVIDERS)
    private readonly providers: ElectricityPriceProvider[],
    config: ConfigService,
  ) {
    this.backfillDays = Number(config.get('PRICING_BACKFILL_DAYS', '30'));
  }

  onApplicationBootstrap(): void {
    void this.backfillAll().catch((err) =>
      this.logger.error(`Bootstrap backfill failed: ${(err as Error).message}`),
    );
  }

  @Cron('35 20 * * *', {
    timeZone: 'Europe/Madrid',
    name: 'pricing_fetch_tomorrow',
  })
  async fetchTomorrowJob(): Promise<void> {
    for (const target of await this.activeTargets()) {
      const provider = this.providerBySource(target.source);
      if (!provider?.enabled) continue;
      const tomorrow = addDays(isoDay(new Date(), provider.marketTimezone), 1);
      await this.ensureDaySafe(target, tomorrow);
    }
  }

  @Cron('10 * * * *', { name: 'pricing_reconcile' })
  async reconcileJob(): Promise<void> {
    for (const target of await this.activeTargets()) {
      const provider = this.providerBySource(target.source);
      if (!provider?.enabled) continue;
      const today = isoDay(new Date(), provider.marketTimezone);
      for (let offset = -2; offset <= 1; offset++) {
        await this.ensureDaySafe(target, addDays(today, offset));
      }
    }
  }

  /** Fire-and-forget seed when a home just switched to a dynamic tariff. */
  async ensureRecent(source: string, zone: string): Promise<void> {
    await this.backfillTarget({ source, zone });
  }

  /** Manual admin refetch; `force` re-downloads even complete days. */
  async refresh(params: {
    source?: PricingSource;
    zone?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ upserted: number }> {
    const targets =
      params.source && params.zone
        ? [{ source: params.source, zone: params.zone }]
        : (await this.activeTargets()).filter(
            (t) =>
              (!params.source || t.source === params.source) &&
              (!params.zone || t.zone === params.zone),
          );

    let upserted = 0;
    for (const target of targets) {
      const provider = this.providerBySource(target.source);
      if (!provider?.enabled) continue;
      const tz = provider.marketTimezone;
      const fromDay = params.from
        ? isoDay(params.from, tz)
        : isoDay(new Date(), tz);
      const toDay = params.to
        ? isoDay(params.to, tz)
        : addDays(isoDay(new Date(), tz), 1);
      for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
        upserted += await this.ensureDaySafe(target, day, true);
      }
    }
    return { upserted };
  }

  private async backfillAll(): Promise<void> {
    const targets = await this.activeTargets();
    if (targets.length === 0) return;
    this.logger.log(
      `Backfilling prices for ${targets.length} target(s), ${this.backfillDays} day(s)`,
    );
    for (const target of targets) await this.backfillTarget(target);
  }

  private async backfillTarget(target: FetchTarget): Promise<void> {
    const provider = this.providerBySource(target.source);
    if (!provider?.enabled) return;
    const today = isoDay(new Date(), provider.marketTimezone);
    let upserted = 0;
    // Tomorrow first (most useful), then walk back.
    for (let offset = 1; offset >= 1 - this.backfillDays; offset--) {
      upserted += await this.ensureDaySafe(target, addDays(today, offset));
    }
    if (upserted > 0) {
      this.logger.log(
        `Backfill ${target.source}/${target.zone}: upserted ${upserted} hourly prices`,
      );
    }
  }

  /**
   * Fetch + upsert one civil day unless it is already complete. Returns the
   * number of upserted rows. Never throws (logs instead) so loops over many
   * days/targets survive a bad day.
   */
  private async ensureDaySafe(
    target: FetchTarget,
    day: string,
    force = false,
  ): Promise<number> {
    try {
      return await this.ensureDay(target, day, force);
    } catch (error) {
      this.logger.warn(
        `ensureDay ${target.source}/${target.zone} ${day} failed: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  private async ensureDay(
    target: FetchTarget,
    day: string,
    force: boolean,
  ): Promise<number> {
    const provider = this.providerBySource(target.source);
    if (!provider?.enabled) return 0;

    const tz = provider.marketTimezone;
    const start = zonedDayStartUtc(day, tz);
    const end = zonedDayStartUtc(addDays(day, 1), tz);
    const expectedHours = Math.round(
      (end.getTime() - start.getTime()) / 3_600_000,
    );

    if (!force) {
      const stored = await this.db.electricityPrice.count({
        where: {
          source: target.source,
          zone: target.zone,
          ts: { gte: start, lt: end },
        },
      });
      if (stored >= expectedHours) return 0;
    }

    const points = await provider.fetchDayAheadPrices(target.zone, day);
    if (points.length === 0) return 0; // not published yet — reconcile retries later

    const hourly = groupPointsToHourly(points);
    await this.db.$transaction(
      hourly.map((h) =>
        this.db.electricityPrice.upsert({
          where: {
            source_zone_ts: {
              source: target.source,
              zone: target.zone,
              ts: h.ts,
            },
          },
          create: {
            source: target.source,
            zone: target.zone,
            ts: h.ts,
            price_kwh: h.priceKwh,
            currency: h.currency,
          },
          update: { price_kwh: h.priceKwh, currency: h.currency },
        }),
      ),
    );
    return hourly.length;
  }

  /** Distinct (provider, zone) pairs referenced by enabled DYNAMIC homes. */
  private async activeTargets(): Promise<FetchTarget[]> {
    const homes = await this.db.home.findMany({
      where: { tariff_type: 'DYNAMIC', disabled: false },
      select: { tariff_config: true },
    });
    const targets = new Map<string, FetchTarget>();
    for (const home of homes) {
      const config = home.tariff_config as {
        provider?: string;
        zone?: string;
      } | null;
      const provider = config?.provider
        ? this.providerBySource(config.provider)
        : undefined;
      if (!provider || !config?.zone) continue;
      if (!provider.zones.some((z) => z.id === config.zone)) continue;
      targets.set(`${provider.source}:${config.zone}`, {
        source: provider.source,
        zone: config.zone,
      });
    }
    return [...targets.values()];
  }

  private providerBySource(
    source: string,
  ): ElectricityPriceProvider | undefined {
    return this.providers.find((p) => p.source === source);
  }
}
