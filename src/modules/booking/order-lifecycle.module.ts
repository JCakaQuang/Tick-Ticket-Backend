import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../../schemas/order.schema';
import { Seat, SeatSchema } from '../../schemas/seat.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { OrderLifecycleService } from './order-lifecycle.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([
    { name: Order.name, schema: OrderSchema },
    { name: Seat.name, schema: SeatSchema },
    { name: TicketTier.name, schema: TicketTierSchema },
  ])],
  providers: [OrderLifecycleService],
  exports: [OrderLifecycleService],
})
export class OrderLifecycleModule {}
