import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentNotificationProcessor } from './payment-notification.processor';
import { Order, OrderSchema } from '../../schemas/order.schema';
import { Seat, SeatSchema } from '../../schemas/seat.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { Ticket, TicketSchema } from '../../schemas/ticket.schema';
import { Coupon, CouponSchema } from '../../schemas/coupon.schema';
import { AuditLog, AuditLogSchema } from '../../schemas/audit-log.schema';
import { Event, EventSchema } from '../../schemas/event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: TicketTier.name, schema: TicketTierSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Event.name, schema: EventSchema },
    ]),
    BullModule.registerQueue({
      name: 'payment-notifications',
    }),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentNotificationProcessor],
  exports: [PaymentService, PaymentNotificationProcessor],
})
export class PaymentModule {}