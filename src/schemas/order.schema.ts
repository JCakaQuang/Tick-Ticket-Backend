import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  ISSUED = 'issued',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

export enum EscrowStatus {
  NONE = 'NONE',
  HELD = 'HELD',
  RECONCILED = 'RECONCILED',
  RELEASED_TO_ORGANIZER = 'RELEASED_TO_ORGANIZER',
  REFUNDED = 'REFUNDED',
}

export enum ReconciliationStatus {
  UNRECONCILED = 'UNRECONCILED',
  MATCHED = 'MATCHED',
  DISCREPANCY = 'DISCREPANCY',
}

export enum PayoutStatus {
  NONE = 'NONE',
  READY = 'READY',
  PAID_OUT = 'PAID_OUT',
  CANCELLED = 'CANCELLED',
}

export class UpsellOrderItem {
  @Prop({ required: true })
  addonCode: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;
}

export class OrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TicketTier', required: true })
  tierId: Types.ObjectId;

  @Prop({ default: '' })
  tierName?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Seat', default: null })
  seatId?: Types.ObjectId | null;

  @Prop({ default: '' })
  seatCode?: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;
}

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderCode: string; // e.g. "ORD-1718901234-ABCD"

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: [OrderItem], required: true })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ default: 0, min: 0 })
  discountAmount: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
    index: true,
  })
  status: OrderStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Coupon', default: null })
  couponId: Types.ObjectId | null;

  @Prop({ required: true, index: true })
  expiresAt: Date; // Exactly 10 minutes from creation

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ default: 'mock_gateway' })
  paymentMethod: string;

  @Prop({ default: '' })
  paymentTransactionId: string;

  @Prop({ type: String, default: undefined })
  idempotencyKey?: string;

  @Prop({ type: [UpsellOrderItem], default: [] })
  upsellItems: UpsellOrderItem[];

  @Prop({ default: 0, min: 0 })
  upsellAmount: number;

  @Prop({ default: 0.05, min: 0, max: 1 })
  platformFeeRate: number;

  @Prop({ default: 0, min: 0 })
  platformFeeAmount: number;

  @Prop({ default: 0, min: 0 })
  gatewayFeeAmount: number;

  @Prop({ default: 0, min: 0 })
  organizerNetAmount: number;

  @Prop({
    type: String,
    enum: Object.values(EscrowStatus),
    default: EscrowStatus.NONE,
    index: true,
  })
  escrowStatus: EscrowStatus;

  @Prop({
    type: String,
    enum: Object.values(ReconciliationStatus),
    default: ReconciliationStatus.UNRECONCILED,
    index: true,
  })
  reconciliationStatus: ReconciliationStatus;

  @Prop({ type: Date, default: null })
  reconciledAt: Date | null;

  @Prop({
    type: String,
    enum: Object.values(PayoutStatus),
    default: PayoutStatus.NONE,
    index: true,
  })
  payoutStatus: PayoutStatus;

  @Prop({ type: Date, default: null })
  payoutAt: Date | null;

  @Prop({ default: '' })
  payoutTransactionRef: string;

  @Prop({ type: Date, default: null })
  refundedAt: Date | null;

  @Prop({ default: '' })
  refundReason: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ status: 1, expiresAt: 1 });
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
OrderSchema.index({ paymentTransactionId: 1 }, { sparse: true });
OrderSchema.index({ eventId: 1, status: 1, escrowStatus: 1 });