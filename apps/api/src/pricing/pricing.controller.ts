import {
  AdminPricingRefreshDto,
  HomePriceCurveResponseDto,
  HomePricesQueryDto,
  HomeTariffResponseDto,
  PricingProviderAdminDto,
  PricingProviderDto,
  UpdateHomeTariffDto,
  UpdateProviderCredentialsDto,
} from '@app/models';
import type { SessionUser } from '@app/models';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'generated/prisma/enums';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { PriceFetchService } from './price-fetch.service';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(AuthenticatedGuard)
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly priceFetchService: PriceFetchService,
  ) {}

  @Get('providers')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  getProviders(): PricingProviderDto[] {
    return this.pricingService.listProviders();
  }

  @Get('homes/:homeId/tariff')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getHomeTariff(
    @Param('homeId', ParseUUIDPipe) homeId: string,
    @GetUserInfo() user: SessionUser,
  ): Promise<HomeTariffResponseDto> {
    return this.pricingService.getHomeTariff(user.id, homeId);
  }

  @Put('homes/:homeId/tariff')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateHomeTariff(
    @Param('homeId', ParseUUIDPipe) homeId: string,
    @Body() dto: UpdateHomeTariffDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<HomeTariffResponseDto> {
    return this.pricingService.updateHomeTariff(user.id, homeId, dto);
  }

  @Get('homes/:homeId/prices')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getHomePrices(
    @Param('homeId', ParseUUIDPipe) homeId: string,
    @Query() q: HomePricesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<HomePriceCurveResponseDto> {
    return this.pricingService.getHomePriceCurve(user.id, homeId, {
      from: q.from,
      to: q.to,
    });
  }

  @Post('admin/refresh')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async refresh(
    @Body() dto: AdminPricingRefreshDto,
  ): Promise<{ upserted: number }> {
    return this.priceFetchService.refresh(dto);
  }

  @Get('admin/providers')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  getAdminProviders(): PricingProviderAdminDto[] {
    return this.pricingService.listProvidersAdmin();
  }

  @Put('admin/providers/:source/credentials')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async updateProviderCredentials(
    @Param('source') source: string,
    @Body() dto: UpdateProviderCredentialsDto,
  ): Promise<PricingProviderAdminDto> {
    return this.pricingService.updateProviderCredentials(source, dto);
  }
}
