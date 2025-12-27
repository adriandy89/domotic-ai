import { Controller, Logger } from '@nestjs/common';
import type { IRulesSensorData } from '@app/models';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RULES_QUEUE_NAME } from './rules-queue.constants';

@Controller()
export class RulesEngineController {
  private readonly logger = new Logger(RulesEngineController.name);

  constructor(
    @InjectQueue(RULES_QUEUE_NAME) private readonly rulesQueue: Queue<IRulesSensorData>,
  ) { }

  @EventPattern('mqtt-core.rules.data')
  async handleNewRulesData(
    @Payload() payload: IRulesSensorData,
  ) {
    this.logger.log(`Received mqtt-core.rules.data, queuing for device: ${payload.deviceId}`);
    try {
      // Add to queue - jobs are processed in FIFO order
      await this.rulesQueue.add('process-rules', payload, {
        // Use deviceId as part of jobId for deduplication if needed
        jobId: `${payload.deviceId}-${Date.now()}`,
        // Remove completed jobs after 1 hour
        removeOnComplete: {
          age: 3600,
        },
        // Keep failed jobs for 12 hours for debugging
        removeOnFail: {
          age: 43200,
        },
      });
      this.logger.verbose(`Queued job for device: ${payload.deviceId}`);
    } catch (error) {
      console.log(error);
      this.logger.error(`Error queuing mqtt-core.rules.data for device: ${payload.deviceId}`);
    }
  }
}
