import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '../../schemas/order.schema';
import { OrderLifecycleService } from './order-lifecycle.service';

@Processor('booking-cleanup')
export class BookingCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingCleanupProcessor.name);
  constructor(private readonly lifecycle: OrderLifecycleService) { super(); }
  @OnWorkerEvent('error')
  onError(error: Error) { this.logger.warn(error.message); }
  async process(job: Job<{ orderId: string }>) {
    return this.lifecycle.release(job.data.orderId, OrderStatus.EXPIRED);
  }
}
