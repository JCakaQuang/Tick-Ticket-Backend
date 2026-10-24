import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  ORGANIZER = 'organizer',
  ADMIN = 'admin',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, unique: true, trim: true })
  phoneNumber: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0, select: false })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null, select: false })
  lockedUntil: Date | null;

  @Prop({ type: Number, default: 0, select: false })
  tokenVersion: number;

  @Prop({ type: Number, default: 0, select: false })
  bookingRevision: number;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Event' }], default: [] })
  wishlist: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
