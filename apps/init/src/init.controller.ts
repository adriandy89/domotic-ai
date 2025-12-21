import { Controller, Get } from '@nestjs/common';
import { InitService } from './init.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class InitController {
  constructor(private readonly initService: InitService) { }

  @MessagePattern('initializers.reset-cache')
  async initializeCache() {
    return await this.initService.initializeCache();
  }

}
