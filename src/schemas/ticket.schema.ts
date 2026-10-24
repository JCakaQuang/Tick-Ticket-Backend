import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

export enum TicketStatus {
  VALID = 'valid',
  USED = 'used',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'tickets' })
export class Ticket {
  @Prop({ required: true, unique: true, index: true })
  ticketCode: string; // e.g. "TCK-1718901234-XYZ"

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TicketTier', required: true })
  tierId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Seat', default: null })
  seatId?: Types.ObjectId | null;

  @Prop({ default: '' })
  seatCode?: string;

  @Prop({ required: true, min: 0 })
  pricePaid: number;

  @Prop({
    type: String,
    enum: Object.values(TicketStatus),
    default: TicketStatus.VALID,
    index: true,
  })
  status: TicketStatus;

  @Prop({ required: true, unique: true, index: true })
  qrToken: string; // HMAC-SHA256 signed payload

  @Prop({ type: Date, default: null })
  checkedInAt: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  checkedInBy: Types.ObjectId | null; // Staff / Organizer ID
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

TicketSchema.index({ eventId: 1, status: 1 });
TicketSchema.index({ userId: 1, eventId: 1 });