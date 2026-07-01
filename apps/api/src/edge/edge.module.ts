import { Module } from '@nestjs/common';
import { EdgeController } from './edge.controller';
import { EdgeService } from './edge.service';
import { EdgeSyncNotifier } from './edge-sync.notifier';

/**
 * Edge integration: pull/upload endpoints for edge devices plus the
 * EdgeSyncNotifier that other modules (rules/schedules/homes) use to trigger a
 * retained-bundle republish on change.
 */
@Module({
  controllers: [EdgeController],
  providers: [EdgeService, EdgeSyncNotifier],
  exports: [EdgeSyncNotifier],
})
export class EdgeModule {}
