import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RulesEngineService } from './rules-engine.service';
import type { IRulesSensorData } from '@app/models';
import { RULES_QUEUE_NAME, RULES_DELAYED_QUEUE_NAME, IDelayedRuleJob } from './rules-queue.constants';

/**
 * Processor for incoming sensor data
 */
@Processor(RULES_QUEUE_NAME, {
    concurrency: 1, // Process one job at a time to ensure ordering
})
export class RulesQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(RulesQueueProcessor.name);

    constructor(private readonly rulesEngineService: RulesEngineService) {
        super();
    }

    async process(job: Job<IRulesSensorData>): Promise<void> {
        this.logger.log(`Processing job ${job.id} for device: ${job.data.deviceId}`);

        try {
            await this.rulesEngineService.processNewData(job.data);
            this.logger.verbose(`Job ${job.id} completed for device: ${job.data.deviceId}`);
        } catch (error) {
            this.logger.error(`Job ${job.id} failed for device: ${job.data.deviceId}`, error);
            throw error;
        }
    }
}

/**
 * Processor for delayed rule execution
 * Jobs arrive here after the interval delay has passed
 */
@Processor(RULES_DELAYED_QUEUE_NAME, {
    concurrency: 5, // Can process multiple delayed jobs in parallel
})
export class RulesDelayedProcessor extends WorkerHost {
    private readonly logger = new Logger(RulesDelayedProcessor.name);

    constructor(private readonly rulesEngineService: RulesEngineService) {
        super();
    }

    async process(job: Job<IDelayedRuleJob>): Promise<void> {
        this.logger.log(`Executing delayed rule ${job.data.ruleId}: ${job.data.ruleName}`);

        try {
            await this.rulesEngineService.executeDelayedRule(job.data);
            this.logger.verbose(`Delayed rule ${job.data.ruleId} executed successfully`);
        } catch (error) {
            this.logger.error(`Delayed rule ${job.data.ruleId} failed`, error);
            throw error;
        }
    }
}
