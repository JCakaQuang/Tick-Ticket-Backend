import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException, Optional, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Order, OrderDocument, OrderStatus, EscrowStatus, ReconciliationStatus, PayoutStatus } from '../../schemas/order.schema';
import { Seat, SeatDocument, SeatStatus } from '../../schemas/seat.schema';
import { TicketTier, TicketTierDocument } from '../../schemas/ticket-tier.schema';
import { Ticket, TicketDocument, TicketStatus } from '../../schemas/ticket.schema';
import { Coupon, CouponDocument } from '../../schemas/coupon.schema';
import { AuditLog, AuditLogDocument } from '../../schemas/audit-log.schema';
import { ProcessPaymentDto, PaymentWebhookDto, ReconcileOrderDto, PayoutOrderDto, RefundOrderDto } from './dto/payment.dto';
import { PaymentNotificationProcessor, PaymentNotificationJobData } from './payment-notification.processor';
import { UserRole } from '../../schemas/user.schema';

const PLATFORM_FEE_RATE = 0.05;
const GATEWAY_FEE_RATE = 0.015;
const WEBHOOK_MAX_DRIFT_MS = 5 * 60 * 1000;
import { OrderLifecycleService } from '../booking/order-lifecycle.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly qrSecret: string;
  private readonly webhookSecret: string;
  private readonly idempotencyCache = new Map<string, { expiresAt: number; result: any }>();
  private readonly inFlightLocks = new Map<string, Promise<any>>();
  constructor(
    @InjectModel(Order.name) private orders: Model<OrderDocument>,
    @InjectModel(Seat.name) private seats: Model<SeatDocument>,
    @InjectModel(TicketTier.name) private tiers: Model<TicketTierDocument>,
    @InjectModel(Ticket.name) private tickets: Model<TicketDocument>,
    @InjectModel(Coupon.name) private coupons: Model<CouponDocument>,
    @InjectModel(AuditLog.name) private audits: Model<AuditLogDocument>,
    private lifecycle: OrderLifecycleService,
    config: ConfigService,
    @Optional() @InjectQueue('payment-notifications') private notificationQueue?: Queue,
    @Optional() private notificationProcessor?: PaymentNotificationProcessor,
  ) {
    this.qrSecret = config.getOrThrow<string>('QR_SECRET');
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET') || this.qrSecret;
    this.notificationQueue?.on('error', (err) => this.logger.warn(err.message));
  }

  calculateCashflowBreakdown(totalAmount: number) {
    const platformFeeAmount = Math.round(totalAmount * PLATFORM_FEE_RATE);
    const gatewayFeeAmount = Math.round(totalAmount * GATEWAY_FEE_RATE);
    const organizerNetAmount = Math.max(0, totalAmount - platformFeeAmount - gatewayFeeAmount);
    return {
      platformFeeRate: PLATFORM_FEE_RATE,
      platformFeeAmount,
      gatewayFeeAmount,
      organizerNetAmount,
    };
  }

  signWebhookPayload(payload: {
    orderId: string;
    providerTransactionId: string;
    amount: number;
    status: 'SUCCESS' | 'FAILED';
    timestamp: number;
  }): string {
    const canonical = `${payload.orderId}:${payload.providerTransactionId}:${payload.amount}:${payload.status}:${payload.timestamp}`;
    return crypto.createHmac('sha256', this.webhookSecret).update(canonical).digest('hex');
  }

  verifyWebhookSignature(dto: PaymentWebhookDto): boolean {
    if (!dto.signature || typeof dto.timestamp !== 'number') return false;
    if (Math.abs(Date.now() - dto.timestamp) > WEBHOOK_MAX_DRIFT_MS) return false;
    const expected = this.signWebhookPayload({
      orderId: dto.orderId,
      providerTransactionId: dto.providerTransactionId,
      amount: dto.amount,
      status: dto.status,
      timestamp: dto.timestamp,
    });
    const actualBuf = Buffer.from(dto.signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  }

  private async enqueueNotification(payload: PaymentNotificationJobData) {
    const jobId = `notif-${payload.type}-${payload.orderId}`;
    try {
      if (this.notificationQueue) {
        await this.notificationQueue.add(payload.type, payload, {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        });
        return;
      }
    } catch (err) {
      this.logger.warn(`BullMQ fallback: ${(err as Error).message}`);
    }
    if (this.notificationProcessor) {
      await this.notificationProcessor.process({ id: jobId, data: payload } as any);
    }
  }

  generateQrToken(ticketId: string, eventId: string, userId: string, timestamp: number) {
    const rawData = ticketId + ':' + eventId + ':' + userId + ':' + timestamp;
    const sig = crypto.createHmac('sha256', this.qrSecret).update(rawData).digest('hex').substring(0, 32);
    return Buffer.from(JSON.stringify({ tId: ticketId, eId: eventId, uId: userId, ts: timestamp, sig })).toString('base64');
  }

  async processPayment(dto: ProcessPaymentDto, userId: string, headerIdempotencyKey?: string) {
    const rawIdemKey = (headerIdempotencyKey || dto.idempotencyKey || '').trim();
    const scopedIdemKey = rawIdemKey ? `${userId}:${rawIdemKey}` : '';

    if (scopedIdemKey) {
      const cached = this.idempotencyCache.get(scopedIdemKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (String(cached.result.order?._id) !== String(dto.orderId)) {
          throw new ConflictException('Idempotency key already used for a different order');
        }
        return { ...cached.result, idempotentReplay: true };
      }
      const inFlight = this.inFlightLocks.get(scopedIdemKey);
      if (inFlight) {
        const res = await inFlight;
        return { ...res, idempotentReplay: true };
      }
    }

    const executionPromise = this.executePaymentTransaction(dto, userId, scopedIdemKey);
    if (scopedIdemKey) {
      this.inFlightLocks.set(scopedIdemKey, executionPromise);
    }

    try {
      const result = await executionPromise;
      if (scopedIdemKey && result && result.success) {
        this.idempotencyCache.set(scopedIdemKey, {
          expiresAt: Date.now() + 15 * 60 * 1000,
          result,
        });
      }
      return result;
    } finally {
      if (scopedIdemKey) {
        this.inFlightLocks.delete(scopedIdemKey);
      }
    }
  }

  private async executePaymentTransaction(
    dto: ProcessPaymentDto,
    userId: string,
    scopedIdemKey?: string,
    webhookTxId?: string,
  ) {
    const result = await this.orders.db.transaction(async session => {
      if (scopedIdemKey) {
        const existingByKey = await this.orders.findOne({ idempotencyKey: scopedIdemKey }).session(session);
        if (existingByKey) {
          if (String(existingByKey._id) !== String(dto.orderId)) {
            throw new ConflictException('Idempotency key already used for a different order');
          }
          if (existingByKey.status === OrderStatus.PAID) {
            return {
              success: true,
              idempotentReplay: true,
              order: existingByKey,
              tickets: await this.tickets.find({ orderId: existingByKey._id }).session(session),
            };
          }
        }
      }
      const order = await this.orders.findById(dto.orderId).session(session);
      if (!order) throw new NotFoundException('Order not found');
      if (order.userId.toString() !== userId) throw new ForbiddenException('You do not own this order');
      if (order.status === OrderStatus.PAID) return { success: true, idempotentReplay: true, order, tickets: await this.tickets.find({ orderId: order._id }).session(session) };
      if (order.status !== OrderStatus.PENDING) throw new BadRequestException('Only pending orders can be paid');
      const now = new Date();
      if (order.expiresAt <= now || dto.action === 'fail') {
        const status = order.expiresAt <= now ? OrderStatus.EXPIRED : OrderStatus.FAILED;
        await this.lifecycle.releaseInSession(order, status, session);
        await this.audits.create([{ userId, action: status === OrderStatus.FAILED ? 'PAYMENT_FAILED' : 'PAYMENT_EXPIRED', targetCollection: 'orders', targetId: order._id, metadata: { orderCode: order.orderCode } }], { session });
        return { rejected: status, orderCode: order.orderCode, totalAmount: order.totalAmount };
      }
      const cashflow = this.calculateCashflowBreakdown(order.totalAmount);
      order.status = OrderStatus.PAID;
      order.paidAt = now;
      order.paymentMethod = dto.paymentMethod || 'mock_gateway';
      order.paymentTransactionId = webhookTxId || ('SANDBOX-' + crypto.randomUUID());
      if (scopedIdemKey) order.idempotencyKey = scopedIdemKey;
      order.platformFeeRate = cashflow.platformFeeRate;
      order.platformFeeAmount = cashflow.platformFeeAmount;
      order.gatewayFeeAmount = cashflow.gatewayFeeAmount;
      order.organizerNetAmount = cashflow.organizerNetAmount;
      order.escrowStatus = EscrowStatus.HELD;
      order.reconciliationStatus = ReconciliationStatus.UNRECONCILED;
      order.payoutStatus = PayoutStatus.NONE;
      await order.save({ session });
      for (const item of order.items) {
        if (item.seatId) {
          const seat = await this.seats.updateOne(
            { _id: item.seatId, status: SeatStatus.RESERVED, orderId: order._id, reservedBy: order.userId, reservedUntil: { $gt: now } },
            { $set: { status: SeatStatus.SOLD, reservedUntil: null, reservedBy: null } }, { session },
          );
          if (!seat.modifiedCount) throw new ConflictException('Seat reservation is no longer owned by this order');
        }
        const tier = await this.tiers.updateOne(
          { _id: item.tierId, reservedQuantity: { $gte: item.quantity } },
          { $inc: { reservedQuantity: -item.quantity, soldQuantity: item.quantity } }, { session },
        );
        if (!tier.modifiedCount) throw new ConflictException('Reserved ticket inventory is inconsistent');
      }
      if (order.couponId) {
        const changed = await this.coupons.updateOne(
          { _id: order.couponId, isActive: true, validFrom: { $lte: now }, validUntil: { $gte: now }, $expr: { $lt: ['$usedCount', '$usageLimit'] } },
          { $inc: { usedCount: 1 } }, { session },
        );
        if (!changed.modifiedCount) throw new BadRequestException('Coupon is no longer available');
      }
      const docs = [];
      for (const item of order.items) {
        for (let n = 0; n < item.quantity; n++) {
          const id = new Types.ObjectId();
          docs.push({ _id: id, ticketCode: 'TCK-' + crypto.randomUUID(), orderId: order._id, eventId: order.eventId, userId: order.userId, tierId: item.tierId, seatId: item.seatId || null, seatCode: item.seatCode || '', pricePaid: item.unitPrice, qrToken: this.generateQrToken(String(id), String(order.eventId), userId, now.getTime() + n), status: TicketStatus.VALID });
        }
      }
      const tickets = await this.tickets.insertMany(docs, { session });
      await this.audits.create([{ userId, action: 'PAYMENT_SUCCESS', targetCollection: 'orders', targetId: order._id, metadata: { transactionId: order.paymentTransactionId, totalAmount: order.totalAmount, escrowStatus: order.escrowStatus, platformFeeAmount: order.platformFeeAmount, organizerNetAmount: order.organizerNetAmount, ticketCount: tickets.length } }], { session });
      return { success: true, message: 'Payment succeeded; tickets issued', order, tickets, cashflow: { escrowStatus: order.escrowStatus, reconciliationStatus: order.reconciliationStatus, payoutStatus: order.payoutStatus, ...cashflow } };
    });
    // Raise the HTTP error after committing the release transaction.
    if ('rejected' in result) {
      void this.enqueueNotification({
        type: 'PAYMENT_FAILED',
        orderId: dto.orderId,
        orderCode: result.orderCode || '',
        userId,
        totalAmount: result.totalAmount || 0,
        reason: result.rejected,
        timestamp: new Date().toISOString(),
      });
      throw new BadRequestException(result.rejected === OrderStatus.EXPIRED ? 'Order has expired; resources released' : 'Payment failed; resources released');
    }
    if (!result.idempotentReplay) {
      void this.enqueueNotification({
        type: 'PAYMENT_SUCCESS',
        orderId: String(result.order._id),
        orderCode: result.order.orderCode,
        userId,
        totalAmount: result.order.totalAmount,
        ticketCount: result.tickets.length,
        timestamp: new Date().toISOString(),
      });
    }
    return result;
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    if (!this.verifyWebhookSignature(dto)) {
      throw new BadRequestException('Invalid webhook signature or expired timestamp');
    }
    const order = await this.orders.findById(dto.orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.PAID) {
      return { RspCode: '00', Message: 'Confirm Success (Idempotent)', idempotentReplay: true, orderId: String(order._id) };
    }
    if (dto.amount !== order.totalAmount) {
      throw new BadRequestException('Webhook amount mismatch with order totalAmount');
    }
    const userId = String(order.userId);
    if (dto.status === 'FAILED') {
      try {
        await this.executePaymentTransaction(
          { orderId: dto.orderId, paymentMethod: dto.provider || 'VNPAY', action: 'fail' },
          userId,
          `webhook:${dto.providerTransactionId}`,
          dto.providerTransactionId,
        );
      } catch {
        // Release transaction already committed before BadRequestException
      }
      return { RspCode: '00', Message: 'Failed status recorded and inventory released' };
    }
    const result = await this.executePaymentTransaction(
      { orderId: dto.orderId, paymentMethod: dto.provider || 'VNPAY', action: 'success' },
      userId,
      `webhook:${dto.providerTransactionId}`,
      dto.providerTransactionId,
    );
    return {
      RspCode: '00',
      Message: 'Confirm Success',
      orderId: String(result.order._id),
      ticketCount: result.tickets.length,
      escrowStatus: result.order.escrowStatus,
    };
  }

  async reconcileOrder(orderId: string, dto: ReconcileOrderDto, adminUserId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PAID) throw new BadRequestException('Only paid orders in escrow can be reconciled');
    const matched = dto.gatewayReportedAmount === order.totalAmount;
    order.reconciliationStatus = matched ? ReconciliationStatus.MATCHED : ReconciliationStatus.DISCREPANCY;
    order.reconciledAt = new Date();
    if (matched) {
      order.escrowStatus = EscrowStatus.RECONCILED;
      order.payoutStatus = PayoutStatus.READY;
    } else {
      order.payoutStatus = PayoutStatus.NONE;
    }
    await order.save();
    await this.audits.create({
      userId: new Types.ObjectId(adminUserId),
      action: matched ? 'PAYMENT_RECONCILED' : 'PAYMENT_RECONCILIATION_DISCREPANCY',
      targetCollection: 'orders',
      targetId: order._id,
      metadata: {
        orderTotalAmount: order.totalAmount,
        gatewayReportedAmount: dto.gatewayReportedAmount,
        gatewaySettlementRef: dto.gatewaySettlementRef || '',
        reconciliationStatus: order.reconciliationStatus,
      },
    });
    return {
      matched,
      orderId: String(order._id),
      escrowStatus: order.escrowStatus,
      reconciliationStatus: order.reconciliationStatus,
      payoutStatus: order.payoutStatus,
      organizerNetAmount: order.organizerNetAmount,
    };
  }

  async payoutOrder(orderId: string, dto: PayoutOrderDto, adminUserId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PAID) throw new BadRequestException('Only paid orders can be paid out');
    if (order.reconciliationStatus !== ReconciliationStatus.MATCHED || order.escrowStatus !== EscrowStatus.RECONCILED) {
      throw new BadRequestException('Order must be reconciled before organizer payout');
    }
    if (order.payoutStatus === PayoutStatus.PAID_OUT) {
      return {
        alreadyPaidOut: true,
        orderId: String(order._id),
        payoutTransactionRef: order.payoutTransactionRef,
        organizerNetAmount: order.organizerNetAmount,
      };
    }
    order.escrowStatus = EscrowStatus.RELEASED_TO_ORGANIZER;
    order.payoutStatus = PayoutStatus.PAID_OUT;
    order.payoutAt = new Date();
    order.payoutTransactionRef = dto.bankTransferRef || `PAYOUT-${crypto.randomUUID()}`;
    await order.save();
    await this.audits.create({
      userId: new Types.ObjectId(adminUserId),
      action: 'ORGANIZER_PAYOUT_COMPLETED',
      targetCollection: 'orders',
      targetId: order._id,
      metadata: {
        payoutTransactionRef: order.payoutTransactionRef,
        grossAmount: order.totalAmount,
        platformFeeAmount: order.platformFeeAmount,
        gatewayFeeAmount: order.gatewayFeeAmount,
        organizerNetAmount: order.organizerNetAmount,
        note: dto.note || '',
      },
    });
    void this.enqueueNotification({
      type: 'PAYOUT_COMPLETED',
      orderId: String(order._id),
      orderCode: order.orderCode,
      userId: adminUserId,
      totalAmount: order.organizerNetAmount,
      timestamp: new Date().toISOString(),
    });
    return {
      success: true,
      orderId: String(order._id),
      escrowStatus: order.escrowStatus,
      payoutStatus: order.payoutStatus,
      payoutTransactionRef: order.payoutTransactionRef,
      organizerNetAmount: order.organizerNetAmount,
    };
  }

  async refundOrder(orderId: string, dto: RefundOrderDto, actorUserId: string, actorRole?: string) {
    const result = await this.orders.db.transaction(async session => {
      const order = await this.orders.findById(orderId).session(session);
      if (!order) throw new NotFoundException('Order not found');
      const isAdminOrOrganizer =
        actorRole === UserRole.ADMIN ||
        actorRole === 'ADMIN' ||
        actorRole === UserRole.ORGANIZER ||
        actorRole === 'ORGANIZER';
      if (!isAdminOrOrganizer && order.userId.toString() !== actorUserId) {
        throw new ForbiddenException('You do not own this order');
      }
      if (order.status === OrderStatus.REFUNDED) {
        return { success: true, idempotentReplay: true, order };
      }
      if (order.status !== OrderStatus.PAID) {
        throw new BadRequestException('Only paid orders can be refunded');
      }
      if (order.payoutStatus === PayoutStatus.PAID_OUT) {
        throw new ConflictException('Cannot directly refund an order after organizer payout has settled');
      }
      const usedTicketCount = await this.tickets
        .countDocuments({ orderId: order._id, status: TicketStatus.USED })
        .session(session);
      if (usedTicketCount > 0) {
        throw new ConflictException('Cannot refund an order that has already checked-in tickets');
      }
      const now = new Date();
      order.status = OrderStatus.REFUNDED;
      order.escrowStatus = EscrowStatus.REFUNDED;
      order.payoutStatus = PayoutStatus.CANCELLED;
      order.refundedAt = now;
      order.refundReason = dto.reason || 'Customer requested refund';
      await order.save({ session });

      await this.tickets.updateMany(
        { orderId: order._id },
        { $set: { status: TicketStatus.CANCELLED } },
        { session },
      );

      for (const item of order.items) {
        if (item.seatId) {
          await this.seats.updateOne(
            { _id: item.seatId, orderId: order._id, status: SeatStatus.SOLD },
            {
              $set: {
                status: SeatStatus.AVAILABLE,
                orderId: null,
                reservedBy: null,
                reservedUntil: null,
              },
            },
            { session },
          );
        }
        await this.tiers.updateOne(
          { _id: item.tierId, soldQuantity: { $gte: item.quantity } },
          { $inc: { soldQuantity: -item.quantity, availableQuantity: item.quantity } },
          { session },
        );
      }

      await this.audits.create(
        [
          {
            userId: new Types.ObjectId(actorUserId),
            action: 'ORDER_REFUNDED',
            targetCollection: 'orders',
            targetId: order._id,
            metadata: {
              orderCode: order.orderCode,
              refundedAmount: order.totalAmount,
              reason: order.refundReason,
            },
          },
        ],
        { session },
      );
      return { success: true, order };
    });

    if (!result.idempotentReplay) {
      void this.enqueueNotification({
        type: 'ORDER_REFUNDED',
        orderId: String(result.order._id),
        orderCode: result.order.orderCode,
        userId: String(result.order.userId),
        totalAmount: result.order.totalAmount,
        reason: result.order.refundReason,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      message: 'Order refunded; tickets voided and inventory restored',
      order: result.order,
    };
  }

  async getCashflowSummary(eventId?: string) {
    const match: Record<string, any> = {
      status: { $in: [OrderStatus.PAID, OrderStatus.REFUNDED] },
    };
    if (eventId && Types.ObjectId.isValid(eventId)) {
      match.eventId = new Types.ObjectId(eventId);
    }
    const orders = await this.orders.find(match).lean().exec();
    let grossPaidVolume = 0;
    let escrowHeldAmount = 0;
    let reconciledReadyAmount = 0;
    let paidOutAmount = 0;
    let platformFeeTotal = 0;
    let gatewayFeeTotal = 0;
    let refundedTotal = 0;

    for (const o of orders) {
      if (o.status === OrderStatus.REFUNDED) {
        refundedTotal += o.totalAmount || 0;
        continue;
      }
      grossPaidVolume += o.totalAmount || 0;
      platformFeeTotal += o.platformFeeAmount || 0;
      gatewayFeeTotal += o.gatewayFeeAmount || 0;
      if (o.escrowStatus === EscrowStatus.HELD) {
        escrowHeldAmount += o.organizerNetAmount || 0;
      } else if (o.escrowStatus === EscrowStatus.RECONCILED) {
        reconciledReadyAmount += o.organizerNetAmount || 0;
      } else if (o.escrowStatus === EscrowStatus.RELEASED_TO_ORGANIZER) {
        paidOutAmount += o.organizerNetAmount || 0;
      }
    }

    return {
      grossPaidVolume,
      escrowHeldAmount,
      reconciledReadyAmount,
      paidOutAmount,
      platformFeeTotal,
      gatewayFeeTotal,
      refundedTotal,
      orderCount: orders.length,
    };
  }
}
