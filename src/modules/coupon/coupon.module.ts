import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { Coupon, CouponSchema } from '../../schemas/coupon.schema';
import { Order, OrderSchema } from '../../schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Coupon.name, schema: CouponSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}