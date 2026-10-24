import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../../schemas/audit-log.schema';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(data: {
    userId?: string | Types.ObjectId;
    action: string;
    targetCollection: string;
    targetId: string | Types.ObjectId;
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.auditLogModel.create({
      ...data,
      metadata: data.metadata || { previousState: data.previousState, newState: data.newState },
      userId: data.userId ? new Types.ObjectId(data.userId) : null,
      targetId: new Types.ObjectId(data.targetId),
    });
  }


  async getLogs(filter: {
    targetCollection?: string;
    targetId?: string;
    userId?: string;
    limit?: number;
  }) {
    const query: any = {};
    if (filter.targetCollection) query.targetCollection = filter.targetCollection;
    if (filter.targetId) query.targetId = new Types.ObjectId(filter.targetId);
    if (filter.userId) query.userId = new Types.ObjectId(filter.userId);

    return this.auditLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter.limit || 100)
      .populate('userId', 'fullName email')
      .exec();
  }
}
