import { Controller, Logger } from '@nestjs/common';
import { RulesEngineService } from './rules-engine.service';
import type { IRulesSensorData } from '@app/models';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class RulesEngineController {
  private readonly logger = new Logger(RulesEngineController.name);
  constructor(private readonly rulesEngineService: RulesEngineService) { }

  @EventPattern('mqtt-core.rules.data')
  async handleNewRulesData(
    @Payload() payload: IRulesSensorData,
  ) {
    this.logger.log(`Received mqtt-core.rules.data: ${JSON.stringify(payload)}`);
    try {
      await this.rulesEngineService.processNewData(payload);
    } catch (error) {
      console.log(error);
      this.logger.error(`Error processing mqtt-core.rules.data deviceId: ${payload.deviceId}`);
    }
  }
}
