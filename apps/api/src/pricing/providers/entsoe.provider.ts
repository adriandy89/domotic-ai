import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { ProviderCredentialsService } from '../provider-credentials.service';
import { addDays, zonedDayStartUtc } from '../time.util';
import {
  ElectricityPriceProvider,
  PriceZone,
  RawPricePoint,
} from './price-provider.interface';

const ENTSOE_BASE_URL = 'https://web-api.tp.entsoe.eu/api';
/** SDAC delivery days are defined in CET/CEST for all coupled zones. */
const MARKET_TIMEZONE = 'Europe/Brussels';

/**
 * Popular bidding zones, short id (fits electricity_prices.zone VARCHAR(16))
 * → EIC area code. EICs follow entsoe-py's mappings.
 */
const ENTSOE_ZONES: Record<string, { eic: string; label: string }> = {
  ES: { eic: '10YES-REE------0', label: 'España' },
  PT: { eic: '10YPT-REN------W', label: 'Portugal' },
  FR: { eic: '10YFR-RTE------C', label: 'France' },
  'DE-LU': { eic: '10Y1001A1001A82H', label: 'Germany–Luxembourg' },
  AT: { eic: '10YAT-APG------L', label: 'Austria' },
  BE: { eic: '10YBE----------2', label: 'Belgium' },
  NL: { eic: '10YNL----------L', label: 'Netherlands' },
  CH: { eic: '10YCH-SWISSGRIDZ', label: 'Switzerland' },
  'IT-NORD': { eic: '10Y1001A1001A73I', label: 'Italy North' },
  PL: { eic: '10YPL-AREA-----S', label: 'Poland' },
  CZ: { eic: '10YCZ-CEPS-----N', label: 'Czechia' },
  HU: { eic: '10YHU-MAVIR----U', label: 'Hungary' },
  DK1: { eic: '10YDK-1--------W', label: 'Denmark West (DK1)' },
  DK2: { eic: '10YDK-2--------M', label: 'Denmark East (DK2)' },
  SE3: { eic: '10Y1001A1001A46L', label: 'Sweden Stockholm (SE3)' },
  SE4: { eic: '10Y1001A1001A47J', label: 'Sweden South (SE4)' },
  NO1: { eic: '10YNO-1--------2', label: 'Norway Oslo (NO1)' },
  NO2: { eic: '10YNO-2--------T', label: 'Norway South (NO2)' },
  FI: { eic: '10YFI-1--------U', label: 'Finland' },
  GR: { eic: '10YGR-HTSO-----Y', label: 'Greece' },
};

/** ENTSO-E period stamps are `yyyyMMddHHmm` in UTC. */
export function formatEntsoePeriod(date: Date): string {
  return date.toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

interface EntsoePoint {
  position: number | string;
  'price.amount': number | string;
}

interface EntsoePeriod {
  timeInterval?: { start?: string; end?: string };
  resolution?: string;
  Point?: EntsoePoint | EntsoePoint[];
}

interface EntsoeTimeSeries {
  'currency_Unit.name'?: string;
  'price_Measure_Unit.name'?: string;
  Period?: EntsoePeriod | EntsoePeriod[];
}

const xmlParser = new XMLParser({ ignoreAttributes: true });

/**
 * Parses an ENTSO-E Publication_MarketDocument (documentType A44) into raw
 * price points. Returns [] when the platform answers with an acknowledgement
 * meaning "no data published yet" (reason 999); throws on any other
 * acknowledgement reason.
 *
 * Curve type A03 omits points whose price equals the previous position, so
 * positions are expanded with forward fill. When a day carries both PT60M and
 * PT15M series (mixed-resolution responses around the 15-minute MTU), only
 * the finer resolution is kept; groupPointsToHourly averages it to hours.
 */
export function parseEntsoePublication(xml: string): RawPricePoint[] {
  const doc = xmlParser.parse(xml) as Record<string, any>;

  const ack = doc?.Acknowledgement_MarketDocument;
  if (ack) {
    const reasons = toArray(ack.Reason as { code?: unknown; text?: unknown });
    const code = String(reasons[0]?.code ?? '');
    const text = String(reasons[0]?.text ?? '');
    if (code === '999' || /no matching data/i.test(text)) return [];
    throw new Error(
      `ENTSO-E acknowledgement (code=${code || 'unknown'}): ${text || 'no reason text'}`,
    );
  }

  const publication = doc?.Publication_MarketDocument;
  if (!publication) {
    throw new Error(
      'Unexpected ENTSO-E response (no Publication_MarketDocument)',
    );
  }

  const byDuration = new Map<number, Map<number, RawPricePoint>>();
  for (const series of toArray<EntsoeTimeSeries>(publication.TimeSeries)) {
    const unit = series['price_Measure_Unit.name'];
    if (unit && unit !== 'MWH') continue;
    const currency = series['currency_Unit.name'] ?? 'EUR';

    for (const period of toArray<EntsoePeriod>(series.Period)) {
      const startIso = period.timeInterval?.start;
      const endIso = period.timeInterval?.end;
      if (!startIso || !endIso) continue;
      const stepMin = period.resolution === 'PT15M' ? 15 : 60;
      const start = new Date(startIso);
      const end = new Date(endIso);
      const slots = Math.round(
        (end.getTime() - start.getTime()) / (stepMin * 60_000),
      );
      if (!Number.isFinite(slots) || slots <= 0) continue;

      const byPos = new Map<number, number>();
      for (const point of toArray<EntsoePoint>(period.Point)) {
        const pos = Number(point.position);
        const price = Number(point['price.amount']);
        if (Number.isInteger(pos) && Number.isFinite(price)) {
          byPos.set(pos, price);
        }
      }

      const bucket =
        byDuration.get(stepMin) ?? new Map<number, RawPricePoint>();
      let priceMwh = NaN;
      for (let pos = 1; pos <= slots; pos++) {
        if (byPos.has(pos)) priceMwh = byPos.get(pos)!;
        if (!Number.isFinite(priceMwh)) continue; // gap before the first point
        const ts = new Date(start.getTime() + (pos - 1) * stepMin * 60_000);
        bucket.set(ts.getTime(), {
          ts,
          durationMin: stepMin,
          priceKwh: priceMwh / 1000, // €/MWh → €/kWh
          currency,
        });
      }
      byDuration.set(stepMin, bucket);
    }
  }

  const preferred = byDuration.get(15) ?? byDuration.get(60);
  if (!preferred) return [];
  return [...preferred.values()].sort(
    (a, b) => a.ts.getTime() - b.ts.getTime(),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class EntsoeProvider implements ElectricityPriceProvider {
  readonly source = 'entsoe';
  readonly label = 'ENTSO-E day-ahead (Europa)';
  readonly marketTimezone = MARKET_TIMEZONE;
  readonly zones: readonly PriceZone[] = Object.entries(ENTSOE_ZONES).map(
    ([id, { label }]) => ({ id, label }),
  );

  private readonly logger = new Logger(EntsoeProvider.name);
  private readonly retryDelaysMs: number[] = [1000, 4000, 9000];

  constructor(
    private readonly http: HttpService,
    private readonly credentials: ProviderCredentialsService,
  ) {}

  get enabled(): boolean {
    return (
      !!this.credentials.getToken(this.source) &&
      !this.credentials.isAuthRejected(this.source)
    );
  }

  async fetchDayAheadPrices(
    zone: string,
    day: string,
  ): Promise<RawPricePoint[]> {
    if (!this.enabled) {
      throw new Error(
        'ENTSO-E provider is disabled (missing or rejected token)',
      );
    }
    const zoneDef = ENTSOE_ZONES[zone];
    if (!zoneDef) throw new Error(`Unknown ENTSO-E zone "${zone}"`);

    const start = zonedDayStartUtc(day, MARKET_TIMEZONE);
    const end = zonedDayStartUtc(addDays(day, 1), MARKET_TIMEZONE);
    // contract_MarketAgreement.type=A01 keeps only the day-ahead auction —
    // since the 15-minute MTU go-live intraday auctions also publish A44.
    const url =
      `${ENTSOE_BASE_URL}?documentType=A44` +
      `&in_Domain=${zoneDef.eic}&out_Domain=${zoneDef.eic}` +
      `&contract_MarketAgreement.type=A01` +
      `&periodStart=${formatEntsoePeriod(start)}` +
      `&periodEnd=${formatEntsoePeriod(end)}`;

    const xml = await this.getWithRetry(url);
    return parseEntsoePublication(xml);
  }

  private async getWithRetry(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      if (attempt > 0) await sleep(this.retryDelaysMs[attempt - 1]);
      try {
        const response = await this.http.axiosRef.get<string>(
          `${url}&securityToken=${encodeURIComponent(
            this.credentials.getToken(this.source) ?? '',
          )}`,
          { responseType: 'text' },
        );
        return typeof response.data === 'string'
          ? response.data
          : String(response.data ?? '');
      } catch (error) {
        const response = (
          error as { response?: { status?: number; data?: unknown } }
        )?.response;
        const status = response?.status;
        if (status === 401 || status === 403) {
          this.credentials.reportAuthRejected(this.source);
          this.logger.error(
            `ENTSO-E token rejected (${status}) — provider disabled until a new token is saved`,
          );
          throw error;
        }
        // "No data" historically arrives as HTTP 400 with an acknowledgement
        // body — hand it to the parser instead of treating it as transport.
        const body = typeof response?.data === 'string' ? response.data : '';
        if (status === 400 && body.includes('Acknowledgement_MarketDocument')) {
          return body;
        }
        if (status && status < 500 && status !== 429) throw error;
        lastError = error;
        this.logger.warn(
          `ENTSO-E request failed (status=${status ?? 'network'}), attempt ${attempt + 1}/${this.retryDelaysMs.length + 1}`,
        );
      }
    }
    throw lastError;
  }
}
