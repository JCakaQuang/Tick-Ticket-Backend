import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { Event, EventSchema } from '../../schemas/event.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { Seat, SeatSchema } from '../../schemas/seat.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: TicketTier.name, schema: TicketTierSchema },
      { name: Seat.name, schema: SeatSchema },
    ]),
  ],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}