import { Controller, Get } from '@nestjs/common';
import { InitService } from './init.service';

@Controller()
export class InitController {
  constructor(private readonly initService: InitService) {}

  @Get()
  getHello(): string {
    return this.initService.getHello();
  }
}
