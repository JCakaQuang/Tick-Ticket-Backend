import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type TicketTierDocument = HydratedDocument<TicketTier>;

export enum TierType {
  SEATED = 'seated',
  GA = 'ga',
}

@Schema({ timestamps: true, collection: 'ticket_tiers' })
export class TicketTier {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: Object.values(TierType), required: true })
  type: TierType;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 0 })
  totalQuantity: number;

  @Prop({ required: true, min: 0 })
  availableQuantity: number;

  @Prop({ required: true, default: 0, min: 0 })
  reservedQuantity: number;

  @Prop({ required: true, default: 0, min: 0 })
  soldQuantity: number;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '#3B82F6' })
  color: string;
}

export const TicketTierSchema = SchemaFactory.createForClass(TicketTier);
TicketTierSchema.index({ eventId: 1, name: 1 });