import { Module } from '@nestjs/common';
import { PriceFetchService } from './price-fetch.service';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { ProviderCredentialsService } from './provider-credentials.service';
import { EntsoeProvider } from './providers/entsoe.provider';
import { EsiosPvpcProvider } from './providers/esios-pvpc.provider';
import { PRICE_PROVIDERS } from './providers/price-provider.interface';

/**
 * Electricity pricing: per-home tariffs (fixed / TOU / dynamic) and the
 * shared market price series. Db/Cache/Http/Config modules are global, and
 * ScheduleModule.forRoot() is already registered by ReportsModule, so @Cron
 * decorators here are discovered without re-importing it.
 */
@Module({
  controllers: [PricingController],
  providers: [
    ProviderCredentialsService,
    EsiosPvpcProvider,
    EntsoeProvider,
    {
      provide: PRICE_PROVIDERS,
      useFactory: (esios: EsiosPvpcProvider, entsoe: EntsoeProvider) => [
        esios,
        entsoe,
      ],
      inject: [EsiosPvpcProvider, EntsoeProvider],
    },
    PriceFetchService,
    PricingService,
  ],
  exports: [PricingService],
})
export class PricingModule {}
