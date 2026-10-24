import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../../schemas/order.schema';
import { Seat, SeatDocument, SeatStatus } from '../../schemas/seat.schema';
import { TicketTier, TicketTierDocument } from '../../schemas/ticket-tier.schema';

@Injectable()
export class OrderLifecycleService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(Seat.name) private readonly seats: Model<SeatDocument>,
    @InjectModel(TicketTier.name) private readonly tiers: Model<TicketTierDocument>,
  ) {}

  async releaseInSession(order: OrderDocument, status: OrderStatus, session: ClientSession) {
    // The order write serializes expiration, cancellation and payment.
    const changed = await this.orders.updateOne(
      { _id: order._id, status: OrderStatus.PENDING },
      { $set: { status } }, { session },
    );
    if (!changed.modifiedCount) return false;
    for (const item of order.items) {
      if (item.seatId) {
        const released = await this.seats.updateOne(
          { _id: item.seatId, orderId: order._id, status: SeatStatus.RESERVED },
          { $set: { status: SeatStatus.AVAILABLE, reservedBy: null, reservedUntil: null, orderId: null } },
          { session },
        );
        // Never release inventory for a seat that now belongs to another order.
        if (!released.modifiedCount) continue;
      }
      const result = await this.tiers.updateOne(
        { _id: item.tierId, reservedQuantity: { $gte: item.quantity } },
        { $inc: { reservedQuantity: -item.quantity, availableQuantity: item.quantity } }, { session },
      );
      if (!result.modifiedCount) throw new ConflictException('Reservation inventory is inconsistent');
    }
    return true;
  }

  async release(orderId: string, status: OrderStatus, userId?: string) {
    return this.orders.db.transaction(async session => {
      const order = await this.orders.findById(orderId).session(session);
      if (!order) {
        if (userId) throw new NotFoundException('Order not found');
        return false;
      }
      if (userId && order.userId.toString() !== userId) throw new ForbiddenException('You do not own this order');
      if (order.status !== OrderStatus.PENDING) return false;
      if (status === OrderStatus.EXPIRED && order.expiresAt > new Date()) return false;
      return this.releaseInSession(order, status, session);
    });
  }

  async expireForEvent(eventId?: string) {
    const orders = await this.orders.find({
      status: OrderStatus.PENDING, expiresAt: { $lte: new Date() },
      ...(eventId ? { eventId } : {}),
    }).select('_id').limit(100);
    for (const order of orders) await this.release(order.id, OrderStatus.EXPIRED);
  }
}
