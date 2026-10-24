import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SystemSettingDocument = HydratedDocument<SystemSetting>;

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSetting {
  @Prop({ required: true, unique: true, default: 'security' })
  key: string;

  @Prop({ required: true, default: 5, min: 1, max: 20 })
  maxFailedLoginAttempts: number;

  @Prop({ required: true, default: 15, min: 1, max: 1440 })
  lockoutDurationMinutes: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SystemSettingSchema = SchemaFactory.createForClass(SystemSetting);

