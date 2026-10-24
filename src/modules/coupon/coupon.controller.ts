import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../schemas/user.schema';
import { ApplyCouponDto } from './dto/coupon.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCouponDto } from '../admin/dto/admin.dto';
import { Types } from 'mongoose';

@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateCoupon(
    @Query('code') code: string,
    @Query('eventId') eventId: string,
    @Query('orderAmount') orderAmount: string,
  ) {
    return this.couponService.validateCoupon(
      code,
      eventId,
      parseFloat(orderAmount || '0'),
    );
  }

  @Get('event/:eventId')
  async getEventCoupons(@Param('eventId', ObjectIdPipe) eventId: string) {
    return this.couponService.getEventCoupons(eventId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.couponService.createCoupon({ ...dto, validFrom: new Date(dto.validFrom), validUntil: new Date(dto.validUntil), applicableEvents: dto.applicableEvents?.map(id => new Types.ObjectId(id)) });
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  async applyCoupon(@Body() body: ApplyCouponDto, @CurrentUser('id') userId: string) {
    return this.couponService.applyCouponToOrder(body.code, body.orderId, userId);
  }
}
