import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

export function configureApp(app: INestApplication) {
  // Support payloads up to 50MB for database backup and restore operations
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:8080').split(',').map(value => value.trim()).filter(Boolean);
  app.enableCors({ origin: origins, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', credentials: false });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}

