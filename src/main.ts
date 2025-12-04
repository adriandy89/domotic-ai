import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  // const environment = configService.get<string>('NODE_ENV');
  // const swaggerEnabled = configService.get<string>('SWAGGER_ENABLE') == 'true';
  const port = configService.get<number>('API_PORT') || 3017;

  await app.listen(port, () => {
    const logger = app.get(Logger);
    logger.log(`Server on port: ${port}`);
  });
}
bootstrap().catch((error) => {
  console.error('❌ Error starting application:', error);
});
