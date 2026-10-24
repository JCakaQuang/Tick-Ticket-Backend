import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TrafficLogDocument = HydratedDocument<TrafficLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'traffic_logs' })
export class TrafficLog {
  @Prop({ required: true, trim: true, index: true })
  path: string;

  @Prop({ default: 'GET' })
  method: string;

  @Prop({ default: '', index: true })
  ipAddress: string;

  @Prop({ default: '' })
  userAgent: string;

  @Prop({ default: 'desktop' })
  deviceType: string; // 'desktop' | 'mobile' | 'tablet'

  @Prop({ default: '' })
  browser: string;

  @Prop({ default: '' })
  referrer: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  userId: Types.ObjectId | null;

  @Prop({ default: false, index: true })
  isSample: boolean;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;

}

export const TrafficLogSchema = SchemaFactory.createForClass(TrafficLog);
TrafficLogSchema.index({ createdAt: -1 });
TrafficLogSchema.index({ path: 1, createdAt: -1 });
TrafficLogSchema.index({ ipAddress: 1, createdAt: -1 });
