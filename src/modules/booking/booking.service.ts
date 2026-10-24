import { Injectable, BadRequestException, ConflictException, NotFoundException, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ReserveBookingDto, ApplyUpsellDto } from './dto/booking.dto';
import { Event, EventDocument, EventStatus } from '../../schemas/event.schema';
import { TicketTier, TicketTierDocument, TierType } from '../../schemas/ticket-tier.schema';
import { Seat, SeatDocument, SeatStatus } from '../../schemas/seat.schema';
import { Order, OrderDocument, OrderStatus, OrderItem } from '../../schemas/order.schema';
import { User, UserDocument } from '../../schemas/user.schema';
import { CouponService } from '../coupon/coupon.service';
import { OrderLifecycleService } from './order-lifecycle.service';

const MAX_TICKETS = 5;
const HOLD_MS = 600000;

@Injectable()
export class BookingService implements OnModuleDestroy {
  private readonly logger = new Logger(BookingService.name);
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    @InjectModel(Event.name) private events: Model<EventDocument>,
    @InjectModel(TicketTier.name) private tiers: Model<TicketTierDocument>,
    @InjectModel(Seat.name) private seats: Model<SeatDocument>,
    @InjectModel(Order.name) private orders: Model<OrderDocument>,
    @InjectModel(User.name) private users: Model<UserDocument>,
    @InjectQueue('booking-cleanup') private cleanupQueue: Queue,
    private lifecycle: OrderLifecycleService,
    private coupons: CouponService,
  ) {
    this.cleanupQueue.on('error', err => this.logger.warn(err.message));
    this.timer = setInterval(() => void this.runLazyCleanup(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() { clearInterval(this.timer); }

  async runLazyCleanup() {
    try { await this.lifecycle.expireForEvent(); }
    catch (error) { this.logger.error('Reservation cleanup failed', error.stack); }
  }

  async validateUserTicketLimit(userId: string, eventId: string, requested: number, session?: ClientSession) {
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_TICKETS) throw new BadRequestException('Select between 1 and 5 tickets');
    const orders = await this.orders.find({
      userId, eventId,
      $or: [{ status: OrderStatus.PAID }, { status: OrderStatus.PENDING, expiresAt: { $gt: new Date() } }],
    }).session(session || null);
    const current = orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0);
    if (current + requested > MAX_TICKETS) throw new BadRequestException('Maximum 5 tickets per customer per event');
  }

  async reserve(dto: ReserveBookingDto, userId: string) {
    const seatIds = dto.seatIds || [];
    if (dto.gaItems?.length && dto.items?.length) throw new BadRequestException('Use either gaItems or items');
    const gaItems = dto.gaItems || dto.items || [];
    const count = seatIds.length + gaItems.reduce((n, item) => n + item.quantity, 0);
    if (new Set(seatIds).size !== seatIds.length || gaItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) throw new BadRequestException('Invalid ticket selection');
    await this.lifecycle.expireForEvent(dto.eventId);
    const order = await this.orders.db.transaction(async session => {
      // Writing the customer serializes concurrent limit checks for that customer.
      const customer = await this.users.updateOne({ _id: userId, isActive: true }, { $inc: { bookingRevision: 1 } }, { session });
      if (!customer.matchedCount) throw new BadRequestException('Customer is not active');
      const event = await this.events.findById(dto.eventId).session(session);
      const now = new Date();
      if (!event || ![EventStatus.PUBLISHED, EventStatus.SALES_OPEN].includes(event.status)) throw new NotFoundException('Event is not open for sales');
      if (event.startTime <= now || (event.saleStartTime && event.saleStartTime > now) || (event.saleEndTime && event.saleEndTime <= now)) throw new BadRequestException('Event sales are closed');
      await this.validateUserTicketLimit(userId, dto.eventId, count, session);
      const holdMs = dto.holdMinutes
        ? dto.holdMinutes * 60 * 1000
        : Number(process.env.TICKET_HOLD_DURATION_MS) || HOLD_MS;
      const expiresAt = new Date(now.getTime() + holdMs);
      const orderId = new Types.ObjectId();
      const items: OrderItem[] = [];
      let subtotal = 0;
      for (const id of seatIds) {
        const seat = await this.seats.findOneAndUpdate(
          { _id: id, eventId: event._id, status: SeatStatus.AVAILABLE },
          { $set: { status: SeatStatus.RESERVED, reservedBy: userId, reservedUntil: expiresAt, orderId } },
          { new: true, session },
        );
        if (!seat) throw new ConflictException('Seat is already reserved or sold');
        const tier = await this.tiers.findOneAndUpdate(
          { _id: seat.tierId, eventId: event._id, type: TierType.SEATED, $expr: { $gte: [{ $subtract: ['$totalQuantity', { $add: ['$soldQuantity', '$reservedQuantity'] }] }, 1] } },
          { $inc: { reservedQuantity: 1, availableQuantity: -1 } }, { new: true, session },
        );
        if (!tier) throw new ConflictException('Seated tier has no inventory');
        items.push({ tierId: tier._id, tierName: tier.name, seatId: seat._id, seatCode: seat.seatCode, unitPrice: tier.price, quantity: 1 });
        subtotal += tier.price;
      }
      for (const item of gaItems) {
        const tier = await this.tiers.findOneAndUpdate(
          { _id: item.tierId, eventId: event._id, type: TierType.GA, $expr: { $gte: [{ $subtract: ['$totalQuantity', { $add: ['$soldQuantity', '$reservedQuantity'] }] }, item.quantity] } },
          { $inc: { reservedQuantity: item.quantity, availableQuantity: -item.quantity } }, { new: true, session },
        );
        if (!tier) throw new ConflictException('GA tier has no inventory');
        items.push({ tierId: tier._id, tierName: tier.name, seatId: null, seatCode: '', unitPrice: tier.price, quantity: item.quantity });
        subtotal += tier.price * item.quantity;
      }
      let discountAmount = 0;
      let couponId = null;
      if (dto.couponCode) {
        const validation = await this.coupons.validateCoupon(dto.couponCode, dto.eventId, subtotal, session);
        discountAmount = validation.discountAmount;
        couponId = validation.couponId;
      }
      const created = new this.orders({ _id: orderId, orderCode: 'ORD-' + randomUUID(), userId, eventId: event._id, items, subtotal, discountAmount, totalAmount: Math.max(0, subtotal - discountAmount), couponId, status: OrderStatus.PENDING, expiresAt });
      await created.save({ session });
      return created;
    });
    try {
      await this.cleanupQueue.add('expire-order', { orderId: order.id }, { delay: Math.max(0, order.expiresAt.getTime() - Date.now()), jobId: 'cleanup-' + order.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true });
    } catch (error) { this.logger.warn('Queue unavailable; periodic cleanup will expire the order'); }
    return { ...order.toObject(), orderId: order._id, reservationExpiresAt: order.expiresAt };
  }

  async getOrder(orderId: string, userId: string) {
    const order = await this.orders.findById(orderId).populate('eventId').populate('items.tierId').populate('items.seatId').populate('couponId', 'code');
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId.toString() !== userId) throw new BadRequestException('You do not own this order');
    return { ...order.toObject(), orderNumber: order.orderCode, reservationExpiresAt: order.expiresAt, couponCode: (order.couponId as any)?.code, items: order.items.map(item => ({ ...(item as any).toObject?.() || item, price: item.unitPrice })) };
  }

  async cancelOrder(orderId: string, userId: string) {
    const changed = await this.lifecycle.release(orderId, OrderStatus.CANCELLED, userId);
    if (!changed) throw new BadRequestException('Only pending orders can be cancelled');
    return { message: 'Order cancelled; reserved tickets released' };
  }

  async applyUpsell(orderId: string, dto: ApplyUpsellDto, userId: string) {
    return this.orders.db.transaction(async session => {
      const order = await this.orders.findById(orderId).session(session);
      if (!order) throw new NotFoundException('Order not found');
      if (order.userId.toString() !== userId) throw new BadRequestException('You do not own this order');
      if (order.status !== OrderStatus.PENDING || order.expiresAt <= new Date()) {
        throw new BadRequestException('Only active pending orders can add upsell items');
      }
      const cleanItems = (dto.items || []).map(item => ({
        addonCode: item.addonCode,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
      const upsellAmount = cleanItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      order.upsellItems = cleanItems;
      order.upsellAmount = upsellAmount;
      order.totalAmount = Math.max(0, order.subtotal + upsellAmount - (order.discountAmount || 0));
      await order.save({ session });
      return {
        order: {
          ...order.toObject(),
          orderNumber: order.orderCode,
          reservationExpiresAt: order.expiresAt,
        },
        upsellAmount,
        totalAmount: order.totalAmount,
      };
    });
  }
}
