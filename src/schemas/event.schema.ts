import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type EventDocument = HydratedDocument<Event>;

export enum EventType {
  SEATED = 'SEATED',
  GA = 'GA',
  HYBRID = 'HYBRID',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  SALES_OPEN = 'SALES_OPEN',
  SALES_CLOSED = 'SALES_CLOSED',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class EventCoordinates {
  @Prop({ default: 0 })
  lat: number;

  @Prop({ default: 0 })
  lng: number;
}

@Schema({ _id: false })
export class EventLocation {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ type: EventCoordinates, default: () => ({ lat: 0, lng: 0 }) })
  coordinates: EventCoordinates;
}

@Schema({ timestamps: true, collection: 'events' })
export class Event {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  bannerUrl: string;

  @Prop({ default: '' })
  posterUrl?: string;

  @Prop({ type: EventLocation, required: true })
  location: EventLocation;

  @Prop({ required: true, index: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ type: Date })
  saleStartTime?: Date;

  @Prop({ type: Date })
  saleEndTime?: Date;

  @Prop({ required: true, enum: EventType, index: true })
  type: EventType;

  @Prop({ default: 'CONCERT', index: true, trim: true })
  category: string;

  @Prop({ required: true, enum: EventStatus, default: EventStatus.DRAFT, index: true })
  status: EventStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  organizerId: Types.ObjectId;

  @Prop({ default: 5, min: 1, max: 5 })
  maxTicketsPerUser: number;

  @Prop({ default: '' })
  seatMapSvgUrl?: string;

  @Prop({ default: '' })
  termsAndConditions?: string;

  @Prop({ default: '' })
  vnpayQrUrl?: string;

  @Prop({ default: '' })
  vnpayTmnCode?: string;

  @Prop({ default: '' })
  vnpayAccountName?: string;

  @Prop({ default: 'VNPAY' })
  vnpayBankName?: string;

  @Prop({ default: false, index: true })
  isSpecial: boolean;

  @Prop({ default: '' })
  specialBadge?: string;

  @Prop({ default: 0 })
  specialOrder: number;

  @Prop({ default: false, index: true })
  isTrending: boolean;

  @Prop({ default: null })
  trendingRank?: number;

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0, min: 0, index: true })
  minPrice: number;

  @Prop({ default: 0, min: 0, index: true })
  maxPrice: number;
}

export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ status: 1, startTime: 1 });
EventSchema.index({ status: 1, category: 1, 'location.city': 1, startTime: 1, minPrice: 1 });
EventSchema.index({ status: 1, minPrice: 1, startTime: 1 });
EventSchema.index({ title: 'text', description: 'text' });
