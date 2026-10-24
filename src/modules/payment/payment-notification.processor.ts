import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../../schemas/audit-log.schema';

export interface PaymentNotificationJobData {
  type: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'ORDER_REFUNDED' | 'PAYOUT_COMPLETED';
  orderId: string;
  orderCode: string;
  userId: string;
  totalAmount: number;
  ticketCount?: number;
  reason?: string;
  timestamp: string;
}

@Processor('payment-notifications')
export class PaymentNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentNotificationProcessor.name);
  private readonly processedJobs = new Map<string, PaymentNotificationJobData & { processedAt: string }>();

  constructor(
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLogDocument>,
  ) {
    super();
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.warn(`Notification worker warning: ${error.message}`);
  }

  async process(job: Job<PaymentNotificationJobData>) {
    const { data } = job;
    const processedAt = new Date().toISOString();

    this.processedJobs.set(job.id || `${data.type}:${data.orderId}`, {
      ...data,
      processedAt,
    });

    if (Types.ObjectId.isValid(data.userId) && Types.ObjectId.isValid(data.orderId)) {
      await this.audits.create({
        userId: new Types.ObjectId(data.userId),
        action: `NOTIFICATION_DISPATCHED_${data.type}`,
        targetCollection: 'orders',
        targetId: new Types.ObjectId(data.orderId),
        metadata: {
          channel: ['EMAIL', 'IN_APP'],
          orderCode: data.orderCode,
          totalAmount: data.totalAmount,
          ticketCount: data.ticketCount || 0,
          reason: data.reason || '',
          processedAt,
        },
      });
    }

    return {
      delivered: true,
      channels: ['EMAIL', 'IN_APP'],
      orderId: data.orderId,
      type: data.type,
      processedAt,
    };
  }

  getProcessedNotifications(userId?: string) {
    const items = Array.from(this.processedJobs.values());
    if (!userId) return items;
    return items.filter((item) => item.userId === userId);
  }
}
