import { NATS_QUEUE } from '@app/models';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AsyncMicroserviceOptions, Transport } from '@nestjs/microservices';
import { IntegrationsModule } from './integrations.module';

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise);
  console.error('🚨 Reason:', reason);
  console.error(
    '🚨 Stack:',
    reason instanceof Error ? reason.stack : 'No stack trace',
  );
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('🚨 Stack:', error.stack);
});

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    IntegrationsModule,
    {
      useFactory: (configService: ConfigService) => {
        const natsUrl = configService.get<string>('NATS_URL');
        if (!natsUrl) {
          throw new Error('NATS_URL environment variable is not set.');
        }
        return {
          transport: Transport.NATS,
          options: {
            servers: [natsUrl],
            timeout: 60_000,
            queue: NATS_QUEUE.INTEGRATIONS,
            user: configService.get<string>('NATS_USER'),
            pass: configService.get<string>('NATS_PASS'),
            maxPayload: 16 * 1024 * 1024,
          },
        };
      },
      inject: [ConfigService],
    },
  );

  const logger = new Logger('bootstrap');

  await app.listen();

  logger.verbose('Integrations microservice is listening on NATS...');
}
bootstrap();
