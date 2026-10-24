import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { ReserveBookingDto, ApplyUpsellDto } from './dto/booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('reserve')
  async reserve(
    @Body() dto: ReserveBookingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.reserve(dto, userId);
  }

  @Post('hold')
  async hold(
    @Body() dto: ReserveBookingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.reserve(dto, userId);
  }

  @Get('orders/:id')
  async getOrder(
    @Param('id', ObjectIdPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.getOrder(orderId, userId);
  }

  @Get(':id')
  async getOrderById(
    @Param('id', ObjectIdPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.getOrder(orderId, userId);
  }

  @Post('orders/:id/cancel')
  async cancelOrder(
    @Param('id', ObjectIdPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.cancelOrder(orderId, userId);
  }

  @Post(':id/cancel')
  async cancelOrderById(
    @Param('id', ObjectIdPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.cancelOrder(orderId, userId);
  }

  @Post('orders/:id/upsell')
  async applyOrderUpsell(
    @Param('id', ObjectIdPipe) orderId: string,
    @Body() dto: ApplyUpsellDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.applyUpsell(orderId, dto, userId);
  }

  @Post(':id/upsell')
  async applyUpsellById(
    @Param('id', ObjectIdPipe) orderId: string,
    @Body() dto: ApplyUpsellDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookingService.applyUpsell(orderId, dto, userId);
  }
}
