import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../../schemas/order.schema';
import { Coupon, CouponDocument, DiscountType } from '../../schemas/coupon.schema';

@Injectable()
export class CouponService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
  ) {}

  async validateCoupon(code: string, eventId: string, orderAmount: number, session?: ClientSession) {
    if (typeof code !== 'string' || !code.trim() || code.length > 50 || !Types.ObjectId.isValid(eventId) || !Number.isFinite(orderAmount) || orderAmount < 0) throw new BadRequestException('Invalid coupon input');
    const coupon = await this.couponModel.findOne({
      code: code.toUpperCase().trim(),
      isActive: true,
    }).session(session || null);

    if (!coupon) {
      throw new NotFoundException('Mã giảm giá không tồn tại.');
    }

    // Check applicable events
    if (
      coupon.applicableEvents &&
      coupon.applicableEvents.length > 0 &&
      !coupon.applicableEvents.some((id) => id.toString() === eventId)
    ) {
      throw new BadRequestException('Mã giảm giá không áp dụng cho sự kiện này.');
    }

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      throw new BadRequestException('Mã giảm giá chưa đến ngày kích hoạt.');
    }

    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException('Mã giảm giá đã hết hạn sử dụng.');
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Mã giảm giá đã vượt quá số lượt sử dụng tối đa.');
    }

    if (orderAmount < coupon.minOrderValue) {
      throw new BadRequestException(
        `Đơn hàng cần đạt tối thiểu ${coupon.minOrderValue.toLocaleString('vi-VN')} VND để sử dụng mã này.`,
      );
    }

    let discountAmount = 0;
    const isPercentage = String(coupon.discountType).toLowerCase() === 'percentage';
    if (isPercentage) {
      discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    if (discountAmount > orderAmount) {
      discountAmount = orderAmount;
    }

    return {
      valid: true,
      couponId: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
    };
  }

  async createCoupon(data: Partial<Coupon>) {
    const code = data.code?.toUpperCase().trim();
    const existing = await this.couponModel.findOne({ code });
    if (existing) {
      throw new BadRequestException('Mã giảm giá đã tồn tại trong hệ thống.');
    }
    return this.couponModel.create({
      ...data,
      code,
    });
  }

  async getEventCoupons(eventId: string) {
    return this.couponModel.find({
      $or: [
        { applicableEvents: new Types.ObjectId(eventId) },
        { applicableEvents: { $size: 0 } },
      ],
      isActive: true,
    });
  }

  async applyCouponToOrder(code: string, orderId: string, userId: string) {
    const validation = await this.orderModel.db.transaction(async session => {
    const order = await this.orderModel.findById(orderId).session(session);
    if (!order) {
      throw new NotFoundException('Đơn hàng không tồn tại.');
    }
    if (order.userId.toString() !== userId) throw new ForbiddenException('You do not own this order');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể áp dụng mã cho đơn hàng đang chờ thanh toán.');
    }
    if (order.expiresAt <= new Date()) throw new BadRequestException('Order has expired');

    const validation = await this.validateCoupon(
      code,
      order.eventId.toString(),
      order.subtotal,
      session,
    );

    order.couponId = new Types.ObjectId(validation.couponId.toString());
    order.discountAmount = validation.discountAmount;
    order.totalAmount = Math.max(0, order.subtotal + (order.upsellAmount || 0) - validation.discountAmount);
    await order.save({ session });
    return validation;
    });

    const populatedOrder = await this.orderModel
      .findById(orderId)
      .populate('eventId')
      .populate('items.tierId')
      .populate('items.seatId');

    const orderObj: any = populatedOrder ? populatedOrder.toObject() : null;
    if (orderObj) {
      orderObj.orderNumber = populatedOrder!.orderCode;
      orderObj.reservationExpiresAt = populatedOrder!.expiresAt;
      orderObj.couponCode = validation.code;
      orderObj.finalAmount = populatedOrder!.totalAmount;
      orderObj.items = (populatedOrder!.items || []).map((item: any) => ({
        ...item,
        price: item.unitPrice,
      }));
    }

    return {
      order: orderObj,
      discountAmount: validation.discountAmount,
    };
  }
}
