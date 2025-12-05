import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import passport from 'passport';
import { RedisStore } from 'connect-redis';
import * as redis from 'redis';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('bootstrap');

  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.setGlobalPrefix('api/v1');

  const configService = app.get(ConfigService);
  const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
  const redisPassword = configService.get<string>('REDIS_PASSWORD') || undefined;
  // Set up Redis client
  const redisClient = redis.createClient({
    url: redisUrl,
    password: redisPassword,
  });
  redisClient.connect().then(() => {
    logger.verbose('✅ Connected to Redis for session storage');
  }).catch((error) => {
    logger.error('❌ Redis connection error:', error);
  });

  // Configure session middleware with Redis
  app.use(
    session({
      store: new RedisStore({
        client: redisClient,
        prefix: 'sess:',
      }),
      secret: configService.get<string>('SESSION_SECRET') || 'default-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true, // Prevent XSS attacks
        secure: configService.get<string>('NODE_ENV') === 'production', // HTTPS only in production
        sameSite: 'lax', // CSRF protection
      },
    }),
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());


  const swaggerEnable = configService.get('SWAGGER_ENABLE') === 'true';
  if (swaggerEnable) {
    const config = new DocumentBuilder()
      .setTitle('API')
      .setDescription('Endpoints - API')
      .addOAuth2()
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document, {
      swaggerOptions: {
        filter: true,
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get<number>('API_PORT') || 3017;

  await app.listen(port, () => {
    logger.verbose(`Server on port: ${port}`);
  });
}
bootstrap().catch((error) => {
  console.error('❌ Error starting application:', error);
});
