import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../schemas/user.schema';
import { Event, EventSchema } from '../../schemas/event.schema';
import { TicketTier, TicketTierSchema } from '../../schemas/ticket-tier.schema';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Event.name, schema: EventSchema },
      { name: TicketTier.name, schema: TicketTierSchema },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
