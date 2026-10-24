import { Controller, Post, Get, Body, Param, Query, Headers, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ProcessPaymentDto, PaymentWebhookDto, ReconcileOrderDto, PayoutOrderDto, RefundOrderDto } from './dto/payment.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../schemas/user.schema';
import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('process')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  async processPayment(
    @Body() dto: ProcessPaymentDto,
    @CurrentUser('id') userId: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentService.processPayment(dto, userId, idempotencyKey);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async handleWebhook(@Body() dto: PaymentWebhookDto) {
    return this.paymentService.handleWebhook(dto);
  }

  @Post('orders/:id/reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reconcileOrder(
    @Param('id', ObjectIdPipe) orderId: string,
    @Body() dto: ReconcileOrderDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentService.reconcileOrder(orderId, dto, adminId);
  }

  @Post('orders/:id/payout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async payoutOrder(
    @Param('id', ObjectIdPipe) orderId: string,
    @Body() dto: PayoutOrderDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentService.payoutOrder(orderId, dto, adminId);
  }

  @Post('orders/:id/refund')
  @UseGuards(JwtAuthGuard)
  async refundOrder(
    @Param('id', ObjectIdPipe) orderId: string,
    @Body() dto: RefundOrderDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.paymentService.refundOrder(orderId, dto, userId, role);
  }

  @Get('cashflow/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  async getCashflowSummary(@Query('eventId') eventId?: string) {
    return this.paymentService.getCashflowSummary(eventId);
  }
}
