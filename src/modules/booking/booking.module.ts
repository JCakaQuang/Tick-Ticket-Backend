import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingCleanupProcessor } from './booking-cleanup.processor';
import { Event, EventSchema } from '../../schemas/event.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { Seat, SeatSchema } from '../../schemas/seat.schema';
import { Order, OrderSchema } from '../../schemas/order.schema';
import { Coupon, CouponSchema } from '../../schemas/coupon.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { CouponModule } from '../coupon/coupon.module';

@Module({
  imports: [
    CouponModule,
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: TicketTier.name, schema: TicketTierSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({
      name: 'booking-cleanup',
    }),
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingCleanupProcessor],
  exports: [BookingService],
})
export class BookingModule {}
