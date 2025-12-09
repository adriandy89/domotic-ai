import { CacheService } from '@app/cache';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';

@Injectable()
export class InitService implements OnModuleInit {
  private readonly logger = new Logger(InitService.name);

  constructor(private readonly cacheService: CacheService) { }

  async onModuleInit() {
    await this.initializeCache();
  }

  async initializeCache() {
    this.logger.log('Clear All Redis caches ...');
    await this.cacheService.flushAll();
    this.logger.log('All Redis caches cleared OK!');


    return { ok: true };
  }
}
