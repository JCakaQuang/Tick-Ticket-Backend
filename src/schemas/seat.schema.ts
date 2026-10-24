import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type SeatDocument = HydratedDocument<Seat>;

export enum SeatStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold',
  LOCKED = 'locked',
}

@Schema({ timestamps: true, collection: 'seats' })
export class Seat {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TicketTier', required: true, index: true })
  tierId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  seatCode: string; // e.g. "A-12"

  @Prop({ required: true, trim: true })
  row: string; // e.g. "A"

  @Prop({ required: true })
  col: number; // e.g. 12

  @Prop({ default: 'Standard' })
  zone: string;

  @Prop({
    type: String,
    enum: Object.values(SeatStatus),
    default: SeatStatus.AVAILABLE,
    index: true,
  })
  status: SeatStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  reservedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null, index: true })
  reservedUntil: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', default: null })
  orderId: Types.ObjectId | null;
}

export const SeatSchema = SchemaFactory.createForClass(Seat);

// Compound Unique Index: prevents duplicate seat definitions per event
SeatSchema.index({ eventId: 1, seatCode: 1 }, { unique: true });

// Compound Index for Concurrency matching and lazy checking queries
SeatSchema.index({ eventId: 1, status: 1, reservedUntil: 1 });