import { DbService } from '@app/db';
import {
  DynamicTariffConfig,
  HomePriceCurveResponseDto,
  HomeTariffResponseDto,
  PricingProviderDto,
  TariffMode,
  TouTariffConfig,
  UpdateHomeTariffDto,
} from '@app/models';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { TariffType } from 'generated/prisma/enums';
import { PriceFetchService } from './price-fetch.service';
import {
  ElectricityPriceProvider,
  PRICE_PROVIDERS,
} from './providers/price-provider.interface';
import { DEFAULT_TARIFF_TIMEZONE, resolveHourlyPrice } from './tariff.util';
import { addDays, isoDay, zonedDayStartUtc } from './time.util';

const HOUR_MS = 3_600_000;

const MODE_TO_TYPE: Record<TariffMode, TariffType> = {
  fixed: 'FIXED',
  tou: 'TOU',
  dynamic: 'DYNAMIC',
};
const TYPE_TO_MODE: Record<TariffType, TariffMode> = {
  FIXED: 'fixed',
  TOU: 'tou',
  DYNAMIC: 'dynamic',
};

/** Subset of the Home row every pricing computation needs. */
export interface PricingHomeFields {
  id: string;
  tariff_type: TariffType;
  tariff_config: unknown;
  kwh_price: Prisma.Decimal | number;
  currency: string;
}

export interface ResolvedHourlyPrices {
  /** Hour start (epoch ms, UTC) → price in currency/kWh. */
  priceByHour: Map<number, number>;
  /** Hours priced with the kwh_price fallback (dynamic homes, missing rows). */
  fallbackHours: Set<number>;
  currency: string;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly db: DbService,
    private readonly priceFetch: PriceFetchService,
    @Inject(PRICE_PROVIDERS)
    private readonly providers: ElectricityPriceProvider[],
  ) {}

  listProviders(): PricingProviderDto[] {
    return this.providers.map((p) => ({
      source: p.source,
      label: p.label,
      enabled: p.enabled,
      zones: [...p.zones],
    }));
  }

  async getHomeTariff(
    userId: string,
    homeId: string,
  ): Promise<HomeTariffResponseDto> {
    const home = await this.assertHomeAccess(userId, homeId);
    return this.toTariffResponse(home);
  }

  async updateHomeTariff(
    userId: string,
    homeId: string,
    dto: UpdateHomeTariffDto,
  ): Promise<HomeTariffResponseDto> {
    await this.assertHomeAccess(userId, homeId);

    const data: Prisma.HomeUpdateInput = {
      tariff_type: MODE_TO_TYPE[dto.mode],
    };
    if (dto.kwh_price != null) data.kwh_price = dto.kwh_price;
    if (dto.currency) data.currency = dto.currency;

    if (dto.mode === 'tou') {
      if (!dto.periods?.length) {
        throw new BadRequestException(
          'TOU tariffs require at least one period',
        );
      }
      const config: TouTariffConfig = {
        timezone: dto.timezone ?? DEFAULT_TARIFF_TIMEZONE,
        periods: dto.periods,
      };
      if (dto.default_price != null) config.default_price = dto.default_price;
      data.tariff_config = config as unknown as Prisma.InputJsonValue;
    } else if (dto.mode === 'dynamic') {
      if (!dto.provider || !dto.zone) {
        throw new BadRequestException(
          'Dynamic tariffs require provider and zone',
        );
      }
      const provider = this.providers.find((p) => p.source === dto.provider);
      if (!provider) {
        throw new BadRequestException(`Unknown provider "${dto.provider}"`);
      }
      if (!provider.zones.some((z) => z.id === dto.zone)) {
        throw new BadRequestException(
          `Zone "${dto.zone}" is not valid for provider "${dto.provider}"`,
        );
      }
      const config: DynamicTariffConfig = {
        provider: dto.provider,
        zone: dto.zone,
      };
      data.tariff_config = config as unknown as Prisma.InputJsonValue;
      // Market prices are stored in EUR; align the home currency unless the
      // caller explicitly set one.
      if (!dto.currency) data.currency = 'EUR';
    } else {
      data.tariff_config = Prisma.DbNull;
    }

    const updated = await this.db.home.update({
      where: { id: homeId },
      data,
      select: {
        id: true,
        tariff_type: true,
        tariff_config: true,
        kwh_price: true,
        currency: true,
      },
    });

    if (dto.mode === 'dynamic' && dto.provider && dto.zone) {
      // Seed prices right away so the home gets data without waiting a cron.
      void this.priceFetch
        .ensureRecent(dto.provider, dto.zone)
        .catch((err) =>
          this.logger.warn(`ensureRecent failed: ${(err as Error).message}`),
        );
    }
    return this.toTariffResponse(updated);
  }

  /**
   * THE shared price-resolution path: every hour in [from, to) gets a price.
   * DYNAMIC → stored market rows, falling back per-hour to kwh_price (tracked
   * in fallbackHours, never synthesized from neighboring days). TOU/FIXED →
   * pure resolveHourlyPrice().
   */
  async getHourlyPrices(
    home: PricingHomeFields,
    from: Date,
    to: Date,
  ): Promise<ResolvedHourlyPrices> {
    const startHour = Math.floor(from.getTime() / HOUR_MS) * HOUR_MS;
    const priceByHour = new Map<number, number>();
    const fallbackHours = new Set<number>();
    const kwhPrice = Number(home.kwh_price ?? 0);

    if (home.tariff_type === 'DYNAMIC') {
      const config = home.tariff_config as Partial<DynamicTariffConfig> | null;
      const rows =
        config?.provider && config?.zone
          ? await this.db.electricityPrice.findMany({
              where: {
                source: config.provider,
                zone: config.zone,
                ts: { gte: new Date(startHour), lt: to },
              },
              select: { ts: true, price_kwh: true },
            })
          : [];
      const stored = new Map(
        rows.map((r) => [r.ts.getTime(), Number(r.price_kwh)]),
      );
      for (let t = startHour; t < to.getTime(); t += HOUR_MS) {
        const price = stored.get(t);
        if (price != null) {
          priceByHour.set(t, price);
        } else {
          priceByHour.set(t, kwhPrice);
          fallbackHours.add(t);
        }
      }
    } else {
      const homeFields = {
        tariff_type: home.tariff_type,
        tariff_config: home.tariff_config,
        kwh_price: kwhPrice,
      };
      for (let t = startHour; t < to.getTime(); t += HOUR_MS) {
        priceByHour.set(t, resolveHourlyPrice(homeFields, new Date(t)));
      }
    }
    return { priceByHour, fallbackHours, currency: home.currency };
  }

  /**
   * Today + tomorrow price curve for the UI. Dynamic homes only expose
   * PUBLISHED hours (no fallback in the curve) plus `tomorrow_published`.
   */
  async getHomePriceCurve(
    userId: string,
    homeId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<HomePriceCurveResponseDto> {
    const home = await this.assertHomeAccess(userId, homeId);
    const timezone = this.homeTimezone(home);

    const today = isoDay(new Date(), timezone);
    const from = range?.from ?? zonedDayStartUtc(today, timezone);
    const to = range?.to ?? zonedDayStartUtc(addDays(today, 2), timezone);
    const tomorrowStart = zonedDayStartUtc(
      addDays(today, 1),
      timezone,
    ).getTime();

    const { priceByHour, fallbackHours, currency } = await this.getHourlyPrices(
      home,
      from,
      to,
    );

    const points = [...priceByHour.entries()]
      .filter(([t]) => !fallbackHours.has(t))
      .sort(([a], [b]) => a - b)
      .map(([t, price]) => ({
        ts: new Date(t).toISOString(),
        price_kwh: round6(price),
      }));

    const currentHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const currentPrice =
      priceByHour.has(currentHour) && !fallbackHours.has(currentHour)
        ? round6(priceByHour.get(currentHour)!)
        : null;

    const tomorrowPublished =
      home.tariff_type !== 'DYNAMIC' ||
      [...priceByHour.keys()].some(
        (t) => t >= tomorrowStart && !fallbackHours.has(t),
      );

    return {
      home_id: homeId,
      mode: TYPE_TO_MODE[home.tariff_type],
      currency,
      points,
      current_price: currentPrice,
      tomorrow_published: tomorrowPublished,
    };
  }

  /** Membership check mirroring ReportsService.assertDeviceAccess. */
  async assertHomeAccess(
    userId: string,
    homeId: string,
  ): Promise<PricingHomeFields> {
    const home = await this.db.home.findUnique({
      where: { id: homeId },
      select: {
        id: true,
        tariff_type: true,
        tariff_config: true,
        kwh_price: true,
        currency: true,
        users: { select: { user_id: true } },
      },
    });
    if (!home) throw new NotFoundException('Home not found');
    if (!home.users.some((u) => u.user_id === userId)) {
      throw new ForbiddenException('No access to this home');
    }
    return home;
  }

  private homeTimezone(home: PricingHomeFields): string {
    if (home.tariff_type === 'TOU') {
      const config = home.tariff_config as Partial<TouTariffConfig> | null;
      if (typeof config?.timezone === 'string' && config.timezone) {
        return config.timezone;
      }
    }
    return DEFAULT_TARIFF_TIMEZONE;
  }

  private toTariffResponse(home: PricingHomeFields): HomeTariffResponseDto {
    const mode = TYPE_TO_MODE[home.tariff_type];
    const base = {
      home_id: home.id,
      mode,
      kwh_price: Number(home.kwh_price ?? 0),
      currency: home.currency,
    };
    if (mode === 'tou') {
      const config = home.tariff_config as Partial<TouTariffConfig> | null;
      return {
        ...base,
        timezone: config?.timezone ?? DEFAULT_TARIFF_TIMEZONE,
        periods: config?.periods ?? [],
        default_price: config?.default_price,
      };
    }
    if (mode === 'dynamic') {
      const config = home.tariff_config as Partial<DynamicTariffConfig> | null;
      return { ...base, provider: config?.provider, zone: config?.zone };
    }
    return base;
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
