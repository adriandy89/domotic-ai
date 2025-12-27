import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { ISensorData } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RulesEngineService {

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
  ) { }

  async processNewData(data: ISensorData) {
    console.log('New data received: ', data.deviceId);


  }
}
