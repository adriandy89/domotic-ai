import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ElectricityPriceProvider,
  PriceZone,
  RawPricePoint,
} from './price-provider.interface';

/**
 * Placeholder for the ENTSO-E Transparency Platform provider (day-ahead
 * prices for all EU bidding zones, free token). Registering it in
 * PRICE_PROVIDERS proves the registry needs no refactor to add sources:
 * implement fetchDayAheadPrices (XML A44 documents → €/MWh), add
 * ENTSOE_API_TOKEN and the bidding-zone list, and flip `enabled`.
 */
@Injectable()
export class EntsoeProvider implements ElectricityPriceProvider {
  readonly source = 'entsoe';
  readonly label = 'ENTSO-E day-ahead (Europa)';
  readonly marketTimezone = 'Europe/Brussels';
  readonly zones: readonly PriceZone[] = [];
  readonly enabled = false;

  fetchDayAheadPrices(): Promise<RawPricePoint[]> {
    throw new NotImplementedException('ENTSO-E provider not implemented yet');
  }
}
