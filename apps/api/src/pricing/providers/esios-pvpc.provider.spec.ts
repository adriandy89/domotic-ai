import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  EsiosIndicatorValue,
  EsiosPvpcProvider,
  parseEsiosIndicatorValues,
} from './esios-pvpc.provider';

const PEN_GEO_ID = 8741;

type MutableEsiosValue = EsiosIndicatorValue & { geo_name: string };

/** Builds an ESIOS indicator `values[]` fixture: 96 quarter-hours for one day. */
function quarterHourDay(
  geoId: number,
  basePriceMwh = 100,
): MutableEsiosValue[] {
  const values: MutableEsiosValue[] = [];
  const dayStartUtc = Date.UTC(2026, 5, 10, 22, 0, 0); // 2026-06-11 00:00 Madrid (CEST)
  for (let q = 0; q < 96; q++) {
    values.push({
      value: basePriceMwh + q, // €/MWh, varies per quarter
      datetime_utc: new Date(dayStartUtc + q * 15 * 60_000).toISOString(),
      geo_id: geoId,
      geo_name: 'Península',
    });
  }
  return values;
}

describe('parseEsiosIndicatorValues', () => {
  it('converts 96 quarter-hour €/MWh values into RawPricePoints in €/kWh', () => {
    const points = parseEsiosIndicatorValues(
      quarterHourDay(PEN_GEO_ID),
      PEN_GEO_ID,
    );
    expect(points).toHaveLength(96);
    expect(points[0].ts.toISOString()).toBe('2026-06-10T22:00:00.000Z');
    expect(points[0].priceKwh).toBeCloseTo(0.1, 10); // 100 €/MWh → 0.100 €/kWh
    expect(points[95].priceKwh).toBeCloseTo(0.195, 10); // 195 €/MWh
    expect(points[0].durationMin).toBe(15);
    expect(points[0].currency).toBe('EUR');
  });

  it('keeps only the requested geo zone', () => {
    const mixed = [...quarterHourDay(PEN_GEO_ID), ...quarterHourDay(8743, 80)];
    const points = parseEsiosIndicatorValues(mixed, PEN_GEO_ID);
    expect(points).toHaveLength(96);
    expect(points.every((p) => p.priceKwh >= 0.1)).toBe(true);
  });

  it('returns [] when values are empty (day not published yet)', () => {
    expect(parseEsiosIndicatorValues([], PEN_GEO_ID)).toEqual([]);
  });

  it('detects hourly granularity from point spacing (pre Oct-2025 data)', () => {
    const hourly = quarterHourDay(PEN_GEO_ID).filter((_, i) => i % 4 === 0);
    const points = parseEsiosIndicatorValues(hourly, PEN_GEO_ID);
    expect(points).toHaveLength(24);
    expect(points[0].durationMin).toBe(60);
  });

  it('skips entries with non-numeric values', () => {
    const values = quarterHourDay(PEN_GEO_ID);
    values[0].value = null;
    expect(parseEsiosIndicatorValues(values, PEN_GEO_ID)).toHaveLength(95);
  });
});

describe('EsiosPvpcProvider', () => {
  // Mirrors axios: AxiosError extends Error and carries `response.status`.
  const axiosError = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status },
    });

  const makeProvider = (token: string | undefined, get: jest.Mock) => {
    const config = { get: jest.fn(() => token) } as unknown as ConfigService;
    const http = { axiosRef: { get } } as unknown as HttpService;
    return new EsiosPvpcProvider(http, config);
  };

  it('is disabled without ESIOS_API_TOKEN and refuses to fetch', async () => {
    const get = jest.fn();
    const provider = makeProvider(undefined, get);
    expect(provider.enabled).toBe(false);
    await expect(
      provider.fetchDayAheadPrices('ES-PEN', '2026-06-11'),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it('fetches, filters by zone geo_id and normalizes prices', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { indicator: { values: quarterHourDay(PEN_GEO_ID) } },
    });
    const provider = makeProvider('test-token', get);
    expect(provider.enabled).toBe(true);

    const points = await provider.fetchDayAheadPrices('ES-PEN', '2026-06-11');
    expect(points).toHaveLength(96);
    expect(points[0].priceKwh).toBeCloseTo(0.1, 10);

    const [url, options] = get.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toContain('indicators/1001');
    expect(url).toContain('geo_ids');
    expect(options.headers['x-api-key']).toBe('test-token');
  });

  it('rejects unknown zones without calling the API', async () => {
    const get = jest.fn();
    const provider = makeProvider('test-token', get);
    await expect(
      provider.fetchDayAheadPrices('XX-YY', '2026-06-11'),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it('retries transient 5xx errors and succeeds', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce({
        data: { indicator: { values: quarterHourDay(PEN_GEO_ID) } },
      });
    const provider = makeProvider('test-token', get);
    (provider as unknown as { retryDelaysMs: number[] }).retryDelaysMs = [
      0, 0, 0,
    ];

    const points = await provider.fetchDayAheadPrices('ES-PEN', '2026-06-11');
    expect(points).toHaveLength(96);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('disables itself on 401 instead of retrying', async () => {
    const get = jest.fn().mockRejectedValue(axiosError(401));
    const provider = makeProvider('bad-token', get);
    (provider as unknown as { retryDelaysMs: number[] }).retryDelaysMs = [
      0, 0, 0,
    ];

    await expect(
      provider.fetchDayAheadPrices('ES-PEN', '2026-06-11'),
    ).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
    expect(provider.enabled).toBe(false);
  });
});
