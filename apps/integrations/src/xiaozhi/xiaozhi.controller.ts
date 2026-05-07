import { XIAOZHI_PATTERNS } from '@app/models';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { XiaozhiConnectionManager } from './xiaozhi-connection.manager';

interface IntegrationEventPayload {
  id: string;
}

@Controller()
export class XiaozhiController {
  private readonly logger = new Logger(XiaozhiController.name);

  constructor(private readonly manager: XiaozhiConnectionManager) {}

  @EventPattern(XIAOZHI_PATTERNS.UPSERTED)
  async onUpserted(@Payload() p: IntegrationEventPayload) {
    this.logger.log(`upserted id=${p.id}`);
    await this.manager.handleUpserted(p.id);
  }

  @EventPattern(XIAOZHI_PATTERNS.DELETED)
  async onDeleted(@Payload() p: IntegrationEventPayload) {
    this.logger.log(`deleted id=${p.id}`);
    await this.manager.handleDeleted(p.id);
  }

  @EventPattern(XIAOZHI_PATTERNS.TEST)
  async onTest(@Payload() p: IntegrationEventPayload) {
    this.logger.log(`test id=${p.id}`);
    await this.manager.handleTest(p.id);
  }
}
