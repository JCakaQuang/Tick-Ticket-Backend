import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

export function configureApp(app: INestApplication) {
  // Support payloads up to 50MB for database backup and restore operations
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  const rawOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:8080').split(',').map(value => value.trim()).filter(Boolean);
  const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const isAllowed = rawOrigins.some((allowed) => {
      if (allowed === '*' || allowed === origin) return true;
      if (allowed.includes('*')) {
        const regex = new RegExp('^' + allowed.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(origin);
      }
      return false;
    });
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  };
  app.enableCors({ origin: corsOrigin, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', credentials: true });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Health check endpoints for Render/Cloud monitoring
  const server = app.getHttpAdapter().getInstance();
  server.get('/', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'TickTicket Backend', timestamp: new Date().toISOString() });
  });
  server.head('/', (_req: any, res: any) => {
    res.status(200).end();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}

