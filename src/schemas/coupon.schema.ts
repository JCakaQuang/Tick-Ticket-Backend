import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type CouponDocument = HydratedDocument<Coupon>;

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

@Schema({ timestamps: true, collection: 'coupons' })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  code: string;

  @Prop({ type: String, enum: Object.values(DiscountType), required: true })
  discountType: DiscountType;

  @Prop({ required: true, min: 0 })
  discountValue: number;

  @Prop({ default: 0, min: 0 })
  minOrderValue: number;

  @Prop({ default: null })
  maxDiscountAmount: number | null;

  @Prop({ required: true, min: 0 })
  usageLimit: number;

  @Prop({ default: 0, min: 0 })
  usedCount: number;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Event' }], default: [] })
  applicableEvents: Types.ObjectId[]; // Empty array means valid for all events

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validUntil: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
CouponSchema.index({ code: 1, isActive: 1 });