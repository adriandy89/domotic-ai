// Keep jest away from the generated Prisma client (ESM-only imports).
jest.mock('@app/db', () => ({ DbService: class DbService {} }));

import { HttpService } from '@nestjs/axios';
import type { ProviderCredentialsService } from '../provider-credentials.service';
import {
  EntsoeProvider,
  formatEntsoePeriod,
  parseEntsoePublication,
} from './entsoe.provider';

/** Publication_MarketDocument fixture with the given periods. */
function publicationXml(periods: string, currency = 'EUR'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0">
  <TimeSeries>
    <currency_Unit.name>${currency}</currency_Unit.name>
    <price_Measure_Unit.name>MWH</price_Measure_Unit.name>
    <curveType>A03</curveType>
    ${periods}
  </TimeSeries>
</Publication_MarketDocument>`;
}

function periodXml(
  start: string,
  end: string,
  resolution: string,
  points: { position: number; price: number }[],
): string {
  return `<Period>
    <timeInterval><start>${start}</start><end>${end}</end></timeInterval>
    <resolution>${resolution}</resolution>
    ${points
      .map(
        (p) =>
          `<Point><position>${p.position}</position><price.amount>${p.price}</price.amount></Point>`,
      )
      .join('\n')}
  </Period>`;
}

const ackXml = (code: string, text: string) => `<?xml version="1.0"?>
<Acknowledgement_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-1:acknowledgementdocument:7:0">
  <Reason><code>${code}</code><text>${text}</text></Reason>
</Acknowledgement_MarketDocument>`;

describe('formatEntsoePeriod', () => {
  it('renders yyyyMMddHHmm in UTC', () => {
    expect(formatEntsoePeriod(new Date('2026-06-10T22:00:00.000Z'))).toBe(
      '202606102200',
    );
  });
});

describe('parseEntsoePublication', () => {
  it('parses a full PT60M day into 24 hourly points in €/kWh', () => {
    const points = Array.from({ length: 24 }, (_, i) => ({
      position: i + 1,
      price: 50 + i, // €/MWh
    }));
    const xml = publicationXml(
      periodXml('2026-06-10T22:00Z', '2026-06-11T22:00Z', 'PT60M', points),
    );
    const parsed = parseEntsoePublication(xml);
    expect(parsed).toHaveLength(24);
    expect(parsed[0].ts.toISOString()).toBe('2026-06-10T22:00:00.000Z');
    expect(parsed[0].priceKwh).toBeCloseTo(0.05, 10);
    expect(parsed[23].priceKwh).toBeCloseTo(0.073, 10);
    expect(parsed[0].durationMin).toBe(60);
    expect(parsed[0].currency).toBe('EUR');
  });

  it('forward-fills omitted A03 positions on a PT15M day', () => {
    // 96 quarter-hours, only positions 1, 5 and 90 published.
    const xml = publicationXml(
      periodXml('2026-06-10T22:00Z', '2026-06-11T22:00Z', 'PT15M', [
        { position: 1, price: 100 },
        { position: 5, price: 200 },
        { position: 90, price: 300 },
      ]),
    );
    const parsed = parseEntsoePublication(xml);
    expect(parsed).toHaveLength(96);
    expect(parsed[0].priceKwh).toBeCloseTo(0.1, 10); // pos 1
    expect(parsed[3].priceKwh).toBeCloseTo(0.1, 10); // pos 4 ← filled from 1
    expect(parsed[4].priceKwh).toBeCloseTo(0.2, 10); // pos 5
    expect(parsed[88].priceKwh).toBeCloseTo(0.2, 10); // pos 89 ← filled from 5
    expect(parsed[89].priceKwh).toBeCloseTo(0.3, 10); // pos 90
    expect(parsed[95].priceKwh).toBeCloseTo(0.3, 10); // pos 96 ← filled from 90
    expect(parsed.every((p) => p.durationMin === 15)).toBe(true);
  });

  it('keeps only the 15-minute series when resolutions are mixed', () => {
    const hourly = periodXml('2026-06-10T22:00Z', '2026-06-11T22:00Z', 'PT60M', [
      { position: 1, price: 60 },
    ]);
    const quarter = periodXml(
      '2026-06-10T22:00Z',
      '2026-06-11T22:00Z',
      'PT15M',
      [{ position: 1, price: 80 }],
    );
    const parsed = parseEntsoePublication(publicationXml(hourly + quarter));
    expect(parsed).toHaveLength(96);
    expect(parsed.every((p) => p.durationMin === 15)).toBe(true);
    expect(parsed[0].priceKwh).toBeCloseTo(0.08, 10);
  });

  it('returns [] for a "no matching data" acknowledgement (reason 999)', () => {
    expect(
      parseEntsoePublication(ackXml('999', 'No matching data found')),
    ).toEqual([]);
  });

  it('throws for acknowledgements with other reason codes', () => {
    expect(() =>
      parseEntsoePublication(ackXml('A01', 'Invalid query parameters')),
    ).toThrow(/acknowledgement/i);
  });

  it('throws on unexpected payloads', () => {
    expect(() => parseEntsoePublication('<Whatever/>')).toThrow();
  });
});

describe('EntsoeProvider', () => {
  const axiosError = (status: number, data?: string) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status, data },
    });

  const fullDayXml = publicationXml(
    periodXml(
      '2026-06-10T22:00Z',
      '2026-06-11T22:00Z',
      'PT60M',
      Array.from({ length: 24 }, (_, i) => ({ position: i + 1, price: 50 })),
    ),
  );

  /** Stateful in-memory stand-in for ProviderCredentialsService. */
  const makeCredentials = (token: string | null) => {
    const rejected = new Set<string>();
    return {
      getToken: jest.fn(() => token),
      isAuthRejected: jest.fn((source: string) => rejected.has(source)),
      reportAuthRejected: jest.fn((source: string) => rejected.add(source)),
    } as unknown as ProviderCredentialsService;
  };

  const makeProvider = (token: string | null, get: jest.Mock) => {
    const http = { axiosRef: { get } } as unknown as HttpService;
    const credentials = makeCredentials(token);
    const provider = new EntsoeProvider(http, credentials);
    (provider as unknown as { retryDelaysMs: number[] }).retryDelaysMs = [
      0, 0, 0,
    ];
    return { provider, credentials };
  };

  it('is disabled without a token and refuses to fetch', async () => {
    const get = jest.fn();
    const { provider } = makeProvider(null, get);
    expect(provider.enabled).toBe(false);
    await expect(
      provider.fetchDayAheadPrices('ES', '2026-06-11'),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it('builds the day-ahead URL with EIC, A44 and A01 filters', async () => {
    const get = jest.fn().mockResolvedValue({ data: fullDayXml });
    const { provider } = makeProvider('tok', get);

    const points = await provider.fetchDayAheadPrices('ES', '2026-06-11');
    expect(points).toHaveLength(24);

    const [url] = get.mock.calls[0] as [string];
    expect(url).toContain('documentType=A44');
    expect(url).toContain('contract_MarketAgreement.type=A01');
    expect(url).toContain('in_Domain=10YES-REE------0');
    expect(url).toContain('out_Domain=10YES-REE------0');
    expect(url).toContain('periodStart=202606102200'); // 00:00 CEST in UTC
    expect(url).toContain('periodEnd=202606112200');
    expect(url).toContain('securityToken=tok');
  });

  it('rejects unknown zones without calling the API', async () => {
    const get = jest.fn();
    const { provider } = makeProvider('tok', get);
    await expect(
      provider.fetchDayAheadPrices('XX', '2026-06-11'),
    ).rejects.toThrow(/unknown/i);
    expect(get).not.toHaveBeenCalled();
  });

  it('retries transient 5xx errors and succeeds', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce({ data: fullDayXml });
    const { provider } = makeProvider('tok', get);

    const points = await provider.fetchDayAheadPrices('ES', '2026-06-11');
    expect(points).toHaveLength(24);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reports auth rejection on 401 instead of retrying', async () => {
    const get = jest.fn().mockRejectedValue(axiosError(401));
    const { provider, credentials } = makeProvider('bad', get);

    await expect(
      provider.fetchDayAheadPrices('ES', '2026-06-11'),
    ).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
    expect(credentials.reportAuthRejected).toHaveBeenCalledWith('entsoe');
    expect(provider.enabled).toBe(false);
  });

  it('treats HTTP 400 acknowledgement bodies as "no data yet"', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(
        axiosError(400, ackXml('999', 'No matching data found')),
      );
    const { provider } = makeProvider('tok', get);

    const points = await provider.fetchDayAheadPrices('ES', '2026-06-11');
    expect(points).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
