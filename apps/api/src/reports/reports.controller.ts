import {
  ReportAggregateQueryDto,
  ReportAggregateResponseDto,
  ReportCostSeriesQueryDto,
  ReportCostSeriesResponseDto,
  ReportExportQueryDto,
  ReportFieldSeriesQueryDto,
  ReportFieldSeriesResponseDto,
  ReportMultiSeriesQueryDto,
  ReportMultiSeriesResponseDto,
  ReportSeriesQueryDto,
  ReportSeriesResponseDto,
  ReportStateEventsQueryDto,
  ReportStateEventsResponseDto,
} from '@app/models';
import type { SessionUser } from '@app/models';
import {
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { Role } from 'generated/prisma/enums';
import { MonthlyReportsService } from './monthly-reports.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthenticatedGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly monthlyReportsService: MonthlyReportsService,
  ) {}

  @Get('series')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getSeries(
    @Query() q: ReportSeriesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportSeriesResponseDto> {
    return this.reportsService.getSeries(user.id, q);
  }

  @Get('field-series')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getFieldSeries(
    @Query() q: ReportFieldSeriesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportFieldSeriesResponseDto> {
    return this.reportsService.getFieldSeries(user.id, q);
  }

  @Get('state-events')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getStateEvents(
    @Query() q: ReportStateEventsQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportStateEventsResponseDto> {
    return this.reportsService.getStateEvents(user.id, q);
  }

  @Get('multi-series')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getMultiSeries(
    @Query() q: ReportMultiSeriesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportMultiSeriesResponseDto> {
    return this.reportsService.getMultiSeries(user.id, q);
  }

  @Get('cost-series')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getCostSeries(
    @Query() q: ReportCostSeriesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportCostSeriesResponseDto> {
    return this.reportsService.getCostSeries(user.id, q);
  }

  @Get('aggregate')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getAggregate(
    @Query() q: ReportAggregateQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<ReportAggregateResponseDto> {
    return this.reportsService.getAggregate(user.id, q);
  }

  @Get('heatmap')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getHeatmap(
    @Query() q: ReportSeriesQueryDto,
    @GetUserInfo() user: SessionUser,
  ): Promise<Array<{ dayOfWeek: number; hour: number; value: number }>> {
    return this.reportsService.getHeatmap(user.id, q);
  }

  @Get('devices-health')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getDevicesHealth(@GetUserInfo() user: SessionUser) {
    return this.reportsService.getDevicesHealth(user.id, user.organization_id);
  }

  @Get('automations')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getAutomations(
    @Query('from') from: string,
    @Query('to') to: string,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.reportsService.getAutomationsReport(
      user.id,
      user.organization_id,
      { from: new Date(from), to: new Date(to) },
    );
  }

  @Get('ai-usage')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getAiUsage(
    @Query('from') from: string,
    @Query('to') to: string,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.reportsService.getAiUsageReport(user.id, user.organization_id, {
      from: new Date(from),
      to: new Date(to),
    });
  }

  @Post('monthly-email')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async sendMonthlyEmail(@GetUserInfo() user: SessionUser) {
    return this.monthlyReportsService.runForOrganization(user.organization_id);
  }

  @Get('export')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() q: ReportExportQueryDto,
    @GetUserInfo() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filename = `report-${q.metric}-${q.device_id}-${q.from.toISOString().slice(0, 10)}_${q.to.toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const generator = this.reportsService.streamCsv(user.id, q);
    return new StreamableFile(Readable.from(generator));
  }
}
