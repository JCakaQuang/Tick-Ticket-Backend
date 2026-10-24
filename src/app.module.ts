import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './modules/auth/auth.module';
import { EventModule } from './modules/event/event.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { UserModule } from './modules/user/user.module';
import { AdminModule } from './modules/admin/admin.module';
import { OrderLifecycleModule } from './modules/booking/order-lifecycle.module';
import { TrafficModule } from './modules/traffic/traffic.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', 'backend/.env'],
      validate: (env: Record<string, any>) => {
        for (const key of ['MONGODB_URI', 'JWT_SECRET', 'QR_SECRET']) {
          if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`${key} must be configured`);
        }
        if (env.JWT_SECRET.length < 16 || env.QR_SECRET.length < 16) throw new Error('JWT_SECRET and QR_SECRET must contain at least 16 characters');
        return env;
      },
    }),

    // Mongoose Database Connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
        dbName: configService.get<string>('MONGODB_DB_NAME') || 'ticketbox',
      }),
      inject: [ConfigService],
    }),

    // BullMQ Redis Connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          connectTimeout: 2000,
          commandTimeout: 2000,
          enableOfflineQueue: false,
          retryStrategy: (times) => (times > 1 ? null : 1000),
        },
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting (Cloudflare / DDoS protection)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Domain Modules
    OrderLifecycleModule,
    AuthModule,
    EventModule,
    BookingModule,
    PaymentModule,
    TicketModule,
    CouponModule,
    AuditLogModule,
    UserModule,
    AdminModule,
    TrafficModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
