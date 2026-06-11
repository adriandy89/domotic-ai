import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification';
import { PricingModule } from '../pricing';
import { MonthlyReportsService } from './monthly-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule, PricingModule],
  controllers: [ReportsController],
  providers: [ReportsService, MonthlyReportsService],
  exports: [MonthlyReportsService],
})
export class ReportsModule {}
