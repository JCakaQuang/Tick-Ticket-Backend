import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  userId: Types.ObjectId | null;

  @Prop({ required: true, trim: true, index: true })
  action: string; // e.g. "RESERVE_SEATS", "CHECK_IN_TICKET"

  @Prop({ required: true, trim: true, index: true })
  targetCollection: string; // e.g. "seats", "orders", "tickets"

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null, index: true })
  targetId: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: '' })
  ipAddress: string;

  @Prop({ default: '' })
  userAgent: string;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ targetCollection: 1, targetId: 1 });
AuditLogSchema.index({ createdAt: -1 });