import { NATS_QUEUE } from '@app/models';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AsyncMicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { ApplianceMonitorModule } from './appliance-monitor.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    ApplianceMonitorModule,
    {
      useFactory: (configService: ConfigService) => {
        const natsUrl = configService.get<string>('NATS_URL');
        if (!natsUrl)
          throw new Error('NATS_URL environment variable is not set.');
        return {
          transport: Transport.NATS,
          options: {
            servers: [natsUrl],
            timeout: 60_000,
            queue: NATS_QUEUE.APPLIANCE_MONITOR,
            user: configService.get<string>('NATS_USER'),
            pass: configService.get<string>('NATS_PASS'),
            maxPayload: 16 * 1024 * 1024,
          },
        };
      },
      inject: [ConfigService],
    },
  );

  await app.listen();
  new Logger('bootstrap').verbose(
    'ApplianceMonitor microservice is listening on NATS...',
  );
}
void bootstrap();
