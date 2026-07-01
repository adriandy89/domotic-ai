import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EdgeModule } from './edge.module';

/**
 * Standalone (no HTTP server) NestJS application context: the edge engine is a
 * background worker driven by MQTT + cron, not an API.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('EdgeRulesEngine');
  const app = await NestFactory.createApplicationContext(EdgeModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  logger.log('Edge rules engine started.');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: edge rules engine failed to start', err);
  process.exit(1);
});
