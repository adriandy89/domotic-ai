import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { getKeyDeviceData, getKeyRuleExecuted, getKeyRuleLastExecution, ISensorData } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Condition, Operation, Result, ResultType, Rule, RuleType } from 'generated/prisma/client';

type RuleWithRelations = Rule & {
  conditions: (Condition & { device: { unique_id: string; home: { unique_id: string } | null } })[];
  results: (Result & { device: { unique_id: string; home: { unique_id: string } | null } | null })[];
};

@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
  ) { }

  /**
   * Process new sensor data and evaluate rules
   */
  async processNewData(sensorData: ISensorData) {
    this.logger.log(`Processing sensor data for device: ${sensorData.deviceId}`);

    if (!sensorData.ruleIds || sensorData.ruleIds.length === 0) {
      this.logger.verbose(`No rules associated with device: ${sensorData.deviceId}`);
      return;
    }

    // Get previous sensor data from cache to detect changes
    const prevSensorData = await this.cacheService.get<{ data: any }>(getKeyDeviceData(sensorData.deviceId));
    if (!prevSensorData?.data) {
      this.logger.verbose(`No previous sensor data found for device: ${sensorData.deviceId}`);
      return;
    }
    // Load rules from database
    const rules = await this.loadRules(sensorData.ruleIds);

    for (const rule of rules) {
      try {
        await this.evaluateAndExecuteRule(rule, sensorData.data, prevSensorData.data);
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.id}: ${error}`);
      }
    }
  }

  /**
   * Load rules with conditions and results from database
   */
  private async loadRules(ruleIds: string[]): Promise<RuleWithRelations[]> {
    const rules = await this.dbService.rule.findMany({
      where: {
        id: { in: ruleIds },
        active: true,
      },
      include: {
        conditions: {
          include: {
            device: {
              select: {
                unique_id: true,
                home: {
                  select: {
                    unique_id: true,
                  },
                },
              },
            },
          },
        },
        results: {
          include: {
            device: {
              select: {
                unique_id: true,
                home: {
                  select: {
                    unique_id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return rules;
  }

  /**
   * Evaluate rule and execute results if conditions are met
   */
  private async evaluateAndExecuteRule(
    rule: RuleWithRelations,
    newData: Record<string, any>,
    prevData?: Record<string, any>,
  ): Promise<void> {
    // Check if rule can be executed based on type
    const canExecute = await this.canExecuteRule(rule);
    if (!canExecute) {
      this.logger.verbose(`Rule ${rule.id} cannot execute at this time`);
      return;
    }

    // Validate conditions
    const conditionsMet = this.validateRuleConditions(rule, newData, prevData);
    if (!conditionsMet) {
      this.logger.verbose(`Rule ${rule.id} conditions not met`);
      return;
    }

    this.logger.log(`Rule ${rule.id} conditions met, executing results`);

    // Execute results
    await this.executeResults(rule);

    // Mark rule as executed
    await this.markRuleExecuted(rule);
  }

  /**
   * Check if rule can be executed based on RuleType
   */
  private async canExecuteRule(rule: Rule): Promise<boolean> {
    const now = new Date();

    switch (rule.type) {
      case RuleType.ONCE: {
        // Check if already executed
        const executed = await this.cacheService.get<boolean>(getKeyRuleExecuted(rule.id));
        if (executed) {
          return false;
        }
        return true;
      }

      case RuleType.RECURRENT: {
        // Check interval since last execution
        if (rule.interval <= 0) {
          return true; // No interval restriction
        }

        const lastExecution = await this.cacheService.get<number>(getKeyRuleLastExecution(rule.id));
        if (!lastExecution) {
          return true; // Never executed
        }

        const elapsedSeconds = (now.getTime() - lastExecution) / 1000;
        return elapsedSeconds >= rule.interval;
      }

      case RuleType.SPECIFIC: {
        // Check if timestamp matches (within 1 minute tolerance)
        if (!rule.timestamp) {
          return false;
        }

        const ruleTime = new Date(rule.timestamp);
        const diffMs = Math.abs(now.getTime() - ruleTime.getTime());
        const oneMinute = 60 * 1000;

        return diffMs <= oneMinute;
      }

      default:
        return false;
    }
  }

  /**
   * Validate all conditions for a rule
   */
  private validateRuleConditions(
    rule: RuleWithRelations,
    newData: Record<string, any>,
    prevData?: Record<string, any>,
  ): boolean {
    if (rule.conditions.length === 0) {
      return true; // No conditions means always true
    }

    const results = rule.conditions.map((condition) =>
      this.validateCondition(condition, newData, prevData),
    );

    // rule.all = true: ALL conditions must pass
    // rule.all = false: ANY condition must pass
    if (rule.all) {
      return results.every((result) => result);
    } else {
      return results.some((result) => result);
    }
  }

  /**
   * Validate a single condition against sensor data
   */
  private validateCondition(
    condition: Condition,
    newData: Record<string, any>,
    prevData?: Record<string, any>,
  ): boolean {
    const currentValue = newData[condition.attribute];

    // If the attribute doesn't exist in the data, condition fails
    if (currentValue === undefined || currentValue === null) {
      return false;
    }

    const targetValue = (condition.data as { value: any })?.value;
    if (targetValue === undefined) {
      this.logger.warn(`Condition ${condition.id} has no target value`);
      return false;
    }

    return this.compareValues(currentValue, condition.operation, targetValue);
  }

  /**
   * Compare values using the specified operation
   */
  private compareValues(currentValue: any, operation: Operation, targetValue: any): boolean {
    // Handle boolean comparisons
    if (typeof currentValue === 'boolean' || typeof targetValue === 'boolean') {
      return this.compareBooleanValues(currentValue, operation, targetValue);
    }

    // Handle numeric comparisons
    if (typeof currentValue === 'number' && typeof targetValue === 'number') {
      return this.compareNumericValues(currentValue, operation, targetValue);
    }

    // Handle string comparisons (only EQ makes sense)
    if (typeof currentValue === 'string' && typeof targetValue === 'string') {
      if (operation === Operation.EQ) {
        return currentValue === targetValue;
      }
      return false;
    }

    // Try to convert to numbers for comparison
    const numCurrent = Number(currentValue);
    const numTarget = Number(targetValue);
    if (!isNaN(numCurrent) && !isNaN(numTarget)) {
      return this.compareNumericValues(numCurrent, operation, numTarget);
    }

    // Fallback: only EQ comparison
    if (operation === Operation.EQ) {
      return currentValue === targetValue;
    }

    return false;
  }

  /**
   * Compare numeric values
   */
  private compareNumericValues(current: number, operation: Operation, target: number): boolean {
    switch (operation) {
      case Operation.EQ:
        return current === target;
      case Operation.GT:
        return current > target;
      case Operation.GTE:
        return current >= target;
      case Operation.LT:
        return current < target;
      case Operation.LTE:
        return current <= target;
      default:
        return false;
    }
  }

  /**
   * Compare boolean values
   */
  private compareBooleanValues(current: any, operation: Operation, target: any): boolean {
    // Convert to boolean
    const boolCurrent = Boolean(current);
    const boolTarget = Boolean(target);

    if (operation === Operation.EQ) {
      return boolCurrent === boolTarget;
    }

    // For GT/GTE: true > false
    if (operation === Operation.GT) {
      return boolCurrent === true && boolTarget === false;
    }
    if (operation === Operation.GTE) {
      return boolCurrent === boolTarget || (boolCurrent === true && boolTarget === false);
    }

    // For LT/LTE: false < true
    if (operation === Operation.LT) {
      return boolCurrent === false && boolTarget === true;
    }
    if (operation === Operation.LTE) {
      return boolCurrent === boolTarget || (boolCurrent === false && boolTarget === true);
    }

    return false;
  }

  /**
   * Execute all results for a rule
   */
  private async executeResults(rule: RuleWithRelations): Promise<void> {
    for (const result of rule.results) {
      try {
        switch (result.type) {
          case ResultType.COMMAND:
            await this.executeCommand(result);
            break;
          case ResultType.NOTIFICATION:
            await this.executeNotification(rule, result);
            break;
          default:
            this.logger.warn(`Unknown result type: ${result.type}`);
        }
      } catch (error) {
        this.logger.error(`Error executing result ${result.id}: ${error}`);
      }
    }
  }

  /**
   * Execute a COMMAND result - sends MQTT command to device
   */
  private async executeCommand(
    result: Result & { device: { unique_id: string; home: { unique_id: string } | null } | null },
  ): Promise<void> {
    if (!result.device || !result.device.home) {
      this.logger.warn(`Result ${result.id} has no device or home associated`);
      return;
    }

    const command = this.buildCommand(result);

    this.logger.log(`Sending command to device ${result.device.unique_id}: ${JSON.stringify(command)}`);

    await this.natsClient.emit('mqtt-core.publish-command', {
      homeUniqueId: result.device.home.unique_id,
      deviceUniqueId: result.device.unique_id,
      command,
    });
  }

  /**
   * Build command payload from result
   */
  private buildCommand(result: Result): Record<string, any> {
    const command: Record<string, any> = {};

    // If result has attribute and data, use those
    if (result.attribute && result.data) {
      const dataValue = (result.data as { value: any })?.value;
      if (dataValue !== undefined) {
        command[result.attribute] = dataValue;
      }
    } else if (result.data) {
      // If only data, use it directly
      return result.data as Record<string, any>;
    }

    return command;
  }

  /**
   * Execute a NOTIFICATION result
   */
  private async executeNotification(
    rule: RuleWithRelations,
    result: Result,
  ): Promise<void> {
    this.logger.log(`Executing notification for rule ${rule.id}, result ${result.id}`);

    // TODO: Implement notification logic
    // For now, emit an event that can be handled by the notifications microservice
    await this.natsClient.emit('rules-engine.notification', {
      ruleId: rule.id,
      ruleName: rule.name,
      resultId: result.id,
      event: result.event,
      userId: rule.user_id,
      homeId: rule.home_id,
    });
  }

  /**
   * Mark rule as executed and update tracking
   */
  private async markRuleExecuted(rule: Rule): Promise<void> {
    const now = Date.now();

    switch (rule.type) {
      case RuleType.ONCE:
        // Mark as executed permanently and deactivate rule
        await this.cacheService.set(getKeyRuleExecuted(rule.id), true);
        await this.dbService.rule.update({
          where: { id: rule.id },
          data: { active: false },
        });
        this.logger.log(`ONCE rule ${rule.id} executed and deactivated`);
        break;

      case RuleType.RECURRENT:
        // Update last execution timestamp
        await this.cacheService.set(getKeyRuleLastExecution(rule.id), now);
        this.logger.verbose(`RECURRENT rule ${rule.id} last execution updated`);
        break;

      case RuleType.SPECIFIC:
        // Mark as executed and deactivate
        await this.cacheService.set(getKeyRuleExecuted(rule.id), true);
        await this.dbService.rule.update({
          where: { id: rule.id },
          data: { active: false },
        });
        this.logger.log(`SPECIFIC rule ${rule.id} executed and deactivated`);
        break;
    }
  }
}
