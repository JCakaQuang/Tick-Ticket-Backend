import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Ticketbox Backend running on port ${port}`);
}

bootstrap().catch(() => {
  console.error('Backend startup failed; check environment and service connectivity.');
  process.exitCode = 1;
});

