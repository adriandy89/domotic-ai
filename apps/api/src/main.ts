import { NATS_QUEUE } from '@app/models';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedisStore } from 'connect-redis';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import passport from 'passport';
import * as redis from 'redis';
import { AppModule } from './app.module';
import { isCrossSiteWriteAllowed } from './security/cross-site-guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('bootstrap');

  // CORS: with credentials enabled, reflecting every origin lets any website
  // call the API as the logged-in user. Set CORS_ORIGINS (comma-separated, e.g.
  // "https://app.example.com,http://localhost:5173") to restrict it. When unset
  // the legacy permissive behaviour is kept so existing deployments don't break.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // "https://app.x/" → "https://app.x"
    .filter(Boolean);
  if (corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS is not set: any origin is allowed with credentials. Set it in production.',
    );
  }
  app.enableCors({
    origin: (origin, callback) => {
      callback(
        null,
        corsOrigins.length === 0 || !origin || corsOrigins.includes(origin),
      );
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // CSRF: CORS only hides responses — a cross-site <form method=POST> still
  // reaches the handler carrying the (SameSite=None in prod) session cookie.
  // With CORS_ORIGINS set, block state-changing browser requests whose Origin
  // is neither allowed nor the API itself. Requests without Origin (Alexa,
  // Lambda, edge, MCP clients, webhooks) are not browser cross-site writes.
  if (corsOrigins.length > 0) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        isCrossSiteWriteAllowed({
          method: req.method,
          origin: req.headers.origin,
          host: req.headers.host,
          allowedOrigins: corsOrigins,
        })
      ) {
        return next();
      }
      logger.warn(
        `Blocked cross-site ${req.method} ${req.originalUrl} origin=${req.headers.origin}`,
      );
      res
        .status(403)
        .json({ statusCode: 403, message: 'Cross-site request blocked' });
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  const configService = app.get(ConfigService);
  const redisUrl =
    configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
  const redisPassword =
    configService.get<string>('REDIS_PASSWORD') || undefined;
  // Set up Redis client
  const redisClient = redis.createClient({
    url: redisUrl,
    password: redisPassword,
  });
  redisClient
    .connect()
    .then(() => {
      logger.verbose('✅ Connected to Redis for session storage');
    })
    .catch((error) => {
      logger.error('❌ Redis connection error:', error);
    });

  const environment = configService.get<string>('NODE_ENV') || 'development';
  // Configure session middleware with Redis
  app.use(
    session({
      name: 'domotic.sh',
      store: new RedisStore({
        client: redisClient,
        prefix: 'sess:',
      }),
      secret:
        configService.get<string>('SESSION_SECRET') ||
        'default-secret-change-in-production',
      resave: true, // Renew session on each request
      saveUninitialized: false, // Don't create sessions for unauthenticated users
      rolling: true, // Reset expiration on each request
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 3, // 3 days (rolling window)
        httpOnly: true, // Prevents JavaScript access to cookies
        secure: environment === 'production', // Use secure cookies in production
        sameSite: environment === 'production' ? 'none' : 'lax', // 'none' for cross-site cookies in production, 'lax' otherwise
        domain:
          environment === 'production'
            ? configService.get('COOKIE_DOMAIN')
            : undefined, // Set domain for production
      },
      proxy: environment === 'production', // Trust proxy in production
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

  const natsUrl = configService.get<string>('NATS_URL');
  if (!natsUrl) {
    throw new Error('NATS_URL environment variable is not set.');
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: {
      servers: [natsUrl],
      timeout: 60_000,
      queue: NATS_QUEUE.API_GATEWAY,
      user: configService.get<string>('NATS_USER'),
      pass: configService.get<string>('NATS_PASS'),
      maxPayload: 16 * 1024 * 1024, // 16MB
    },
  });
  await app.startAllMicroservices();

  const port = configService.get<number>('API_PORT') || 3017;

  await app.listen(port, () => {
    logger.verbose(
      `Server on: ${environment === 'development' ? 'http://localhost:' + port : 'port: ' + port}`,
    );
  });
}
bootstrap().catch((error) => {
  console.error('❌ Error starting application:', error);
});
