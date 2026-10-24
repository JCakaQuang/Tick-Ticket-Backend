import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../../schemas/user.schema';
import { Event, EventSchema } from '../../schemas/event.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { Seat, SeatSchema } from '../../schemas/seat.schema';
import { Order, OrderSchema } from '../../schemas/order.schema';
import { Ticket, TicketSchema } from '../../schemas/ticket.schema';
import { Coupon, CouponSchema } from '../../schemas/coupon.schema';
import { AuditLog, AuditLogSchema } from '../../schemas/audit-log.schema';
import { SystemSetting, SystemSettingSchema } from '../../schemas/system-setting.schema';
import { TrafficLog, TrafficLogSchema } from '../../schemas/traffic-log.schema';
import { TrafficModule } from '../traffic/traffic.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Event.name, schema: EventSchema },
      { name: TicketTier.name, schema: TicketTierSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: SystemSetting.name, schema: SystemSettingSchema },
      { name: TrafficLog.name, schema: TrafficLogSchema },
    ]),
    TrafficModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}


