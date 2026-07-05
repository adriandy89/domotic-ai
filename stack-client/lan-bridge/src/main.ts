import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BridgeModule } from './bridge.module';

/**
 * Standalone (no HTTP server) NestJS application context: the LAN bridge is a
 * background worker that speaks vendor protocols (webOS, …) on one side and
 * the home's MQTT broker on the other.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('LanBridge');
  const app = await NestFactory.createApplicationContext(BridgeModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  logger.log('LAN bridge started.');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: LAN bridge failed to start', err);
  process.exit(1);
});
