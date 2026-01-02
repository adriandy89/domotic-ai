import { Controller, Get } from '@nestjs/common';
import { AiServiceService } from './ai-service.service';
import { EventPattern } from '@nestjs/microservices';

@Controller()
export class AiServiceController {
  constructor(private readonly aiServiceService: AiServiceService) { }

  @EventPattern('ai.test')
  getHello(): string {
    return this.aiServiceService.getHello();
  }
}
