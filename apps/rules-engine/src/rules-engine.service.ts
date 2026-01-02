import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { IRulesSensorData } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationChannel, Operation, ResultType, RuleType } from 'generated/prisma/client';
import { RULES_DELAYED_QUEUE_NAME, IDelayedRuleJob } from './rules-queue.constants';

// Type matching the select query structure
type RuleSelected = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  all: boolean;
  type: RuleType;
  interval: number;
  timestamp: Date | null;
  created_at: Date;
  user: {
    id: string;
    organization_id: string;
    phone: string | null;
    email: string;
  };
  conditions: {
    id: string;
    device_id: string;
    attribute: string;
    operation: Operation;
    data: any;
  }[];
  results: {
    id: string;
    device_id: string | null;
    event: string;
    attribute: string | null;
    data: any;
    type: ResultType;
    channel: NotificationChannel[];
    resend_after: number | null;
  }[];
  home: {
    id: string;
    name: string;
    unique_id: string;
  };
};

// Cache key for pending delayed rule job
const getKeyRulePendingJob = (ruleId: string) => `rule:${ruleId}:pending-job`;

@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
    @InjectQueue(RULES_DELAYED_QUEUE_NAME) private readonly delayedQueue: Queue<IDelayedRuleJob>,
  ) { }

  /**
   * Process new sensor data and evaluate rules
   */
  async processNewData(sensorData: IRulesSensorData) {
    this.logger.log(`Processing sensor data for device: ${sensorData.deviceId}`);

    if (!sensorData.ruleIds || sensorData.ruleIds.length === 0) {
      this.logger.verbose(`No rules associated with device: ${sensorData.deviceId}`);
      return;
    }

    // Load rules from database
    const rules = await this.loadRules(sensorData.ruleIds);

    try {
      await Promise.all(rules.map(rule =>
        this.evaluateAndExecuteRule(rule, sensorData.deviceId, sensorData.data, sensorData.prevData)
      ));
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Load rules with conditions and results from database
   */
  private async loadRules(ruleIds: string[]): Promise<RuleSelected[]> {
    const rules = await this.dbService.rule.findMany({
      where: {
        id: { in: ruleIds },
        active: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        all: true,
        type: true,
        user: {
          select: {
            id: true,
            organization_id: true,
            phone: true,
            email: true,
          },
        },
        interval: true,
        timestamp: true,
        conditions: {
          select: {
            id: true,
            device_id: true,
            attribute: true,
            operation: true,
            data: true,
          },
        },
        results: {
          select: {
            id: true,
            device_id: true,
            event: true,
            attribute: true,
            data: true,
            type: true,
            channel: true,
            resend_after: true,
          },
        },
        home: {
          select: {
            id: true,
            name: true,
            unique_id: true,
          },
        },
        created_at: true,
      },
    });

    return rules;
  }

  /**
   * Evaluate rule and execute results if conditions are met
   */
  private async evaluateAndExecuteRule(
    rule: RuleSelected,
    currentDeviceId: string,
    newData: Record<string, any>,
    prevData?: Record<string, any>,
  ): Promise<void> {
    // Check if rule can be executed based on type
    const canExecute = await this.canExecuteRule(rule);
    if (!canExecute) {
      this.logger.verbose(`Rule ${rule.id} cannot execute at this time`);
      return;
    }

    const currentDeviceConditions = rule.conditions.filter(c => c.device_id === currentDeviceId);
    if (currentDeviceConditions.length === 0) {
      this.logger.verbose(`Rule ${rule.id} has no conditions for device ${currentDeviceId}`);
      return;
    }

    // Anti-spam: check if relevant attribute changed
    const hasRelevantChange = currentDeviceConditions.some(condition => {
      const newValue = newData[condition.attribute];
      const oldValue = prevData?.[condition.attribute];
      return newValue !== oldValue;
    });

    if (!hasRelevantChange) {
      this.logger.verbose(`Rule ${rule.id}: No relevant attribute change`);
      return;
    }

    // Validate conditions
    const conditionsMet = await this.evaluateRule(rule, currentDeviceId, newData, prevData);

    // Check if there's a pending delayed job for this rule
    const pendingJobId = await this.cacheService.get<string>(getKeyRulePendingJob(rule.id));

    if (!conditionsMet) {
      // Conditions NOT met
      if (pendingJobId) {
        // Cancel the pending delayed job
        await this.cancelDelayedJob(rule.id, pendingJobId);
      }
      this.logger.verbose(`Rule ${rule.id} conditions not met`);
      return;
    }

    // Conditions ARE met
    this.logger.log(`Rule ${rule.id} conditions met`);

    // If interval > 0, schedule delayed execution (or keep existing)
    if (rule.interval > 0) {
      if (pendingJobId) {
        // Already scheduled, don't schedule again
        this.logger.verbose(`Rule ${rule.id} already scheduled (job ${pendingJobId})`);
        return;
      }

      // Schedule delayed execution
      await this.scheduleDelayedExecution(rule);
      return;
    }

    // No interval - execute immediately
    await this.executeResults(rule);
    await this.markRuleExecuted(rule);
  }

  /**
   * Schedule delayed rule execution
   */
  private async scheduleDelayedExecution(rule: RuleSelected): Promise<void> {
    const delayMs = rule.interval * 1000;

    const jobData: IDelayedRuleJob = {
      ruleId: rule.id,
      ruleName: rule.name,
      homeUniqueId: rule.home.unique_id,
      results: rule.results.map(r => ({
        id: r.id,
        device_id: r.device_id,
        event: r.event,
        attribute: r.attribute,
        data: r.data,
        type: r.type,
        channel: r.channel,
        resend_after: r.resend_after,
      })),
      userId: rule.user.id,
      homeId: rule.home.id,
    };

    const job = await this.delayedQueue.add(
      'execute-rule',
      jobData,
      {
        delay: delayMs,
        jobId: `delayed-rule-${rule.id}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
      }
    );

    // Store the job ID in cache so we can cancel it later
    // TTL = interval + 60 seconds buffer
    await this.cacheService.set(getKeyRulePendingJob(rule.id), job.id, rule.interval + 60);

    this.logger.log(`Rule ${rule.id} scheduled for execution in ${rule.interval}s (job ${job.id})`);
  }

  /**
   * Cancel a pending delayed job
   */
  private async cancelDelayedJob(ruleId: string, jobId: string): Promise<void> {
    this.logger.log(`Canceling delayed job ${jobId} for rule ${ruleId}`);
    try {
      const job = await this.delayedQueue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.log(`Cancelled delayed job ${jobId} for rule ${ruleId}`);
      } else {
        this.logger.warn(`Delayed job ${jobId} not found for rule ${ruleId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cancel job ${jobId}: ${error}`);
    }

    // Clear the pending job cache
    await this.cacheService.del(getKeyRulePendingJob(ruleId));
  }

  /**
   * Execute a delayed rule (called by RulesDelayedProcessor)
   */
  async executeDelayedRule(jobData: IDelayedRuleJob): Promise<void> {
    this.logger.log(`Executing delayed rule ${jobData.ruleId}: ${jobData.ruleName}`);

    // Clear the pending job cache
    await this.cacheService.del(getKeyRulePendingJob(jobData.ruleId));

    // Execute each result
    for (const result of jobData.results) {
      try {
        if (result.type === ResultType.COMMAND) {
          await this.executeCommand(jobData.homeUniqueId, result);
        } else if (result.type === ResultType.NOTIFICATION) {
          await this.executeNotification({
            ruleId: jobData.ruleId,
            ruleName: jobData.ruleName,
            userId: jobData.userId,
            homeId: jobData.homeId,
          }, result);
        }
        await this.dbService.rule.update({
          where: { id: jobData.ruleId },
          data: { timestamp: new Date() },
        });
      } catch (error) {
        this.logger.error(`Error executing delayed result ${result.id}: ${error}`);
      }
    }

    // Mark rule as executed (for ONCE rules, deactivate)
    await this.markRuleExecutedById(jobData.ruleId);
  }

  /**
   * Execute command (unified for both immediate and delayed execution)
   */
  private async executeCommand(
    homeUniqueId: string,
    result: { id: string; device_id: string | null; attribute: string | null; data: any },
  ): Promise<void> {
    if (!result.device_id) {
      this.logger.warn(`Result ${result.id} has no device_id`);
      return;
    }

    const device = await this.dbService.device.findUnique({
      where: { id: result.device_id },
      select: { unique_id: true },
    });

    if (!device) {
      this.logger.warn(`Device ${result.device_id} not found`);
      return;
    }

    const command = this.buildCommandUnified(result);

    this.logger.log(`Sending command to device ${device.unique_id}: ${JSON.stringify(command)}`);

    await this.natsClient.emit<{
      homeUniqueId: string;
      deviceUniqueId: string;
      command: any
    }>('mqtt-core.publish-command', {
      homeUniqueId,
      deviceUniqueId: device.unique_id,
      command,
    });
  }

  /**
   * Build command payload (unified for both result types)
   */
  private buildCommandUnified(result: { attribute: string | null; data: any }): Record<string, any> {
    const command: Record<string, any> = {};

    if (result.attribute && result.data) {
      const dataValue = (result.data as { value: any })?.value;
      if (dataValue !== undefined) {
        command[result.attribute] = dataValue;
      }
    } else if (result.data) {
      return result.data as Record<string, any>;
    }

    return command;
  }

  /**
   * Mark rule as executed by ID (for delayed execution)
   */
  private async markRuleExecutedById(ruleId: string): Promise<void> {
    const rule = await this.dbService.rule.findUnique({
      where: { id: ruleId },
      select: { type: true },
    });

    if (!rule) return;

    if (rule.type === RuleType.ONCE) {
      await this.dbService.rule.update({
        where: { id: ruleId },
        data: { active: false },
      });
      this.logger.log(`ONCE rule ${ruleId} executed and deactivated`);
    }
  }

  /**
   * Check if rule can be executed based on RuleType
   */
  private async canExecuteRule(rule: RuleSelected): Promise<boolean> {
    switch (rule.type) {
      case RuleType.ONCE:
        return rule.active;

      case RuleType.RECURRENT:
        return true; // RECURRENT can always execute (interval handles delay)

      default:
        return false;
    }
  }

  /**
   * Evaluate rule conditions
   */
  private async evaluateRule(
    rule: RuleSelected,
    currentDeviceId: string,
    newData: Record<string, any>,
    prevData?: Record<string, any>,
  ): Promise<boolean> {
    if (rule.conditions.length === 0) {
      return true;
    }
    console.log(JSON.stringify(rule));
    console.log(currentDeviceId);
    console.log(prevData);
    console.log(newData);

    const currentDeviceConditions = rule.conditions.filter(c => c.device_id === currentDeviceId);
    // Evaluate current device conditions
    const currentDeviceResults = currentDeviceConditions.map(condition => {
      const attributeValue = newData[condition.attribute];
      return this.evaluateCondition(condition, attributeValue);
    });

    if (!rule.all) {
      return currentDeviceResults.some(result => result);
    }

    const allCurrentPass = currentDeviceResults.every(result => result);
    if (!allCurrentPass) {
      return false;
    }

    // Check other devices if ALL mode
    const otherDeviceConditions = rule.conditions.filter(c => c.device_id !== currentDeviceId);
    if (otherDeviceConditions.length === 0) {
      return true;
    }

    const otherDeviceIds = [...new Set(otherDeviceConditions.map(c => c.device_id))];

    const otherDevicesData = await this.dbService.sensorDataLast.findMany({
      where: { device_id: { in: otherDeviceIds } },
      select: { device_id: true, data: true },
    });

    const deviceDataMap = new Map<string, any>();
    for (const d of otherDevicesData) {
      deviceDataMap.set(d.device_id, d.data);
    }

    for (const condition of otherDeviceConditions) {
      const deviceData = deviceDataMap.get(condition.device_id);
      if (!deviceData) {
        this.logger.verbose(`Rule ${rule.id}: No data for device ${condition.device_id}`);
        return false;
      }

      const attributeValue = deviceData[condition.attribute];
      if (!this.evaluateCondition(condition, attributeValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(
    condition: RuleSelected['conditions'][0],
    value: any,
  ): boolean {
    if (value === undefined || value === null) {
      return false;
    }

    const targetValue = (condition.data as { value: any })?.value;
    if (targetValue === undefined) {
      this.logger.warn(`Condition ${condition.id} has no target value`);
      return false;
    }

    switch (condition.operation) {
      case Operation.EQ:
        return value === targetValue;
      case Operation.GT:
        return value > targetValue;
      case Operation.GTE:
        return value >= targetValue;
      case Operation.LT:
        return value < targetValue;
      case Operation.LTE:
        return value <= targetValue;
      default:
        return false;
    }
  }

  /**
   * Execute all results for a rule (immediate execution)
   */
  private async executeResults(rule: RuleSelected): Promise<void> {
    for (const result of rule.results) {
      try {
        switch (result.type) {
          case ResultType.COMMAND:
            await this.executeCommand(rule.home.unique_id, result);
            break;
          case ResultType.NOTIFICATION:
            await this.executeNotification({
              ruleId: rule.id,
              ruleName: rule.name,
              userId: rule.user.id,
              homeId: rule.home.id,
            }, result);
            break;
          default:
            this.logger.warn(`Unknown result type: ${result.type}`);
        }
        await this.dbService.rule.update({
          where: { id: rule.id },
          data: { timestamp: new Date() },
        });
      } catch (error) {
        this.logger.error(`Error executing result ${result.id}: ${error}`);
      }
    }
  }

  /**
   * Execute notification (unified for both immediate and delayed execution)
   */
  private async executeNotification(
    ruleInfo: { ruleId: string; ruleName: string; userId: string; homeId: string },
    result: { id: string; event: string; channel: string[] | NotificationChannel[] },
  ): Promise<void> {
    this.logger.log(`Executing notification for rule ${ruleInfo.ruleId}, result ${result.id}`);

    // Fetch user with their configured notification channels
    const user = await this.dbService.user.findUnique({
      where: { id: ruleInfo.userId },
      select: {
        id: true,
        channels: true,
        telegram_chat_id: true,
        email: true,
        phone: true,
        fmc_tokens: true,
      },
    });

    const home = await this.dbService.home.findUnique({
      where: { id: ruleInfo.homeId },
      select: { name: true },
    });

    if (!user) {
      this.logger.warn(`User ${ruleInfo.userId} not found for notification`);
      return;
    }

    // Find matching channels between result.channel and user.channels
    const resultChannels = result.channel as NotificationChannel[];
    const userChannels = user.channels || [];
    const matchingChannels = resultChannels.filter((ch) => userChannels.includes(ch));

    if (matchingChannels.length === 0) {
      this.logger.verbose(`No matching channels for user ${ruleInfo.userId}. Result channels: ${resultChannels}, User channels: ${userChannels}`);
      return;
    }

    this.logger.log(`Sending notification via channels: ${matchingChannels.join(', ')}`);

    // Emit notification for each matching channel
    for (const channel of matchingChannels) {
      const notificationPayload = {
        ruleId: ruleInfo.ruleId,
        ruleName: ruleInfo.ruleName,
        resultId: result.id,
        event: result.event,
        userId: ruleInfo.userId,
        homeId: ruleInfo.homeId,
        homeName: home?.name,
      };

      switch (channel) {
        case NotificationChannel.TELEGRAM:
          if (user.telegram_chat_id) {
            this.logger.log(`Emitting telegram notification for user ${ruleInfo.userId}`);
            await this.natsClient.emit('notification.telegram', {
              ...notificationPayload,
              chatId: user.telegram_chat_id,
            });
          } else {
            this.logger.warn(`User ${ruleInfo.userId} has TELEGRAM channel enabled but no chat_id linked`);
          }
          break;

        case NotificationChannel.EMAIL:
          if (user.email) {
            this.logger.log(`Emitting email notification for user ${ruleInfo.userId}`);
            await this.natsClient.emit('notification.email', {
              ...notificationPayload,
              email: user.email,
            });
          } else {
            this.logger.warn(`User ${ruleInfo.userId} has EMAIL channel enabled but no email address`);
          }
          break;

        case NotificationChannel.SMS:
          this.logger.log(`SMS notification not implemented yet. Payload: ${JSON.stringify(notificationPayload)}`);
          break;

        case NotificationChannel.PUSH:
          this.logger.log(`PUSH notification not implemented yet. Payload: ${JSON.stringify(notificationPayload)}`);
          break;

        case NotificationChannel.WEBHOOK:
          this.logger.log(`WEBHOOK notification not implemented yet. Payload: ${JSON.stringify(notificationPayload)}`);
          break;

        default:
          this.logger.warn(`Unknown notification channel: ${channel}`);
      }
    }
  }

  /**
   * Mark rule as executed
   */
  private async markRuleExecuted(rule: RuleSelected): Promise<void> {
    if (rule.type === RuleType.ONCE) {
      await this.dbService.rule.update({
        where: { id: rule.id },
        data: { active: false },
      });
      this.logger.log(`ONCE rule ${rule.id} executed and deactivated`);
    }
  }
}
