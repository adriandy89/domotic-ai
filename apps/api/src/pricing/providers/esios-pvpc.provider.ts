import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ProviderCredentialsService } from '../provider-credentials.service';
import { addDays, zonedDayStartUtc } from '../time.util';
import {
  ElectricityPriceProvider,
  PriceZone,
  RawPricePoint,
} from './price-provider.interface';

const ESIOS_BASE_URL = 'https://api.esios.ree.es';
/** Indicator 1001 = PVPC 2.0TD (€/MWh, quarter-hourly since Oct 2025). */
const PVPC_INDICATOR_ID = 1001;
const MARKET_TIMEZONE = 'Europe/Madrid';

const ESIOS_GEO_IDS: Record<string, number> = {
  'ES-PEN': 8741,
  'ES-CAN': 8742,
  'ES-BAL': 8743,
  'ES-CEU': 8744,
  'ES-MEL': 8745,
};

/** One entry of `indicator.values[]` as returned by ESIOS (may carry nulls). */
export interface EsiosIndicatorValue {
  value: number | null;
  datetime_utc: string;
  geo_id?: number;
}

interface EsiosIndicatorResponse {
  indicator?: { values?: EsiosIndicatorValue[] };
}

export function parseEsiosIndicatorValues(
  values: EsiosIndicatorValue[],
  geoId: number,
): RawPricePoint[] {
  const points = (values ?? [])
    .filter(
      (v) =>
        v &&
        typeof v.value === 'number' &&
        Number.isFinite(v.value) &&
        !!v.datetime_utc &&
        (v.geo_id == null || v.geo_id === geoId),
    )
    .map((v) => ({
      ts: new Date(v.datetime_utc),
      priceKwh: (v.value as number) / 1000, // ESIOS publishes €/MWh
      currency: 'EUR',
      durationMin: 60,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  if (points.length >= 2) {
    const spacingMin = Math.round(
      (points[1].ts.getTime() - points[0].ts.getTime()) / 60_000,
    );
    if (spacingMin === 15) {
      for (const point of points) point.durationMin = 15;
    }
  }
  return points;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class EsiosPvpcProvider implements ElectricityPriceProvider {
  readonly source = 'esios_pvpc';
  readonly label = 'PVPC — Red Eléctrica (ESIOS)';
  readonly marketTimezone = MARKET_TIMEZONE;
  readonly zones: readonly PriceZone[] = [
    { id: 'ES-PEN', label: 'Península' },
    { id: 'ES-CAN', label: 'Canarias' },
    { id: 'ES-BAL', label: 'Baleares' },
    { id: 'ES-CEU', label: 'Ceuta' },
    { id: 'ES-MEL', label: 'Melilla' },
  ];

  private readonly logger = new Logger(EsiosPvpcProvider.name);
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
        'ESIOS PVPC provider is disabled (missing or rejected token)',
      );
    }
    const geoId = ESIOS_GEO_IDS[zone];
    if (!geoId) throw new Error(`Unknown ESIOS PVPC zone "${zone}"`);

    const start = zonedDayStartUtc(day, MARKET_TIMEZONE);
    const end = new Date(
      zonedDayStartUtc(addDays(day, 1), MARKET_TIMEZONE).getTime() - 1,
    );
    const url =
      `${ESIOS_BASE_URL}/indicators/${PVPC_INDICATOR_ID}` +
      `?start_date=${encodeURIComponent(start.toISOString())}` +
      `&end_date=${encodeURIComponent(end.toISOString())}` +
      `&geo_ids[]=${geoId}`;

    const data = await this.getWithRetry(url);
    return parseEsiosIndicatorValues(data.indicator?.values ?? [], geoId);
  }

  private async getWithRetry(url: string): Promise<EsiosIndicatorResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      if (attempt > 0) await sleep(this.retryDelaysMs[attempt - 1]);
      try {
        const response = await this.http.axiosRef.get<EsiosIndicatorResponse>(
          url,
          {
            headers: {
              Accept: 'application/json; application/vnd.esios-api-v1+json',
              'x-api-key': this.credentials.getToken(this.source) ?? '',
            },
          },
        );
        return response.data ?? {};
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status === 401 || status === 403) {
          this.credentials.reportAuthRejected(this.source);
          this.logger.error(
            `ESIOS token rejected (${status}) — provider disabled until a new token is saved`,
          );
          throw error;
        }
        if (status && status < 500 && status !== 429) throw error;
        lastError = error;
        this.logger.warn(
          `ESIOS request failed (status=${status ?? 'network'}), attempt ${attempt + 1}/${this.retryDelaysMs.length + 1}`,
        );
      }
    }
    throw lastError;
  }
}
