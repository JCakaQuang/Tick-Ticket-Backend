import { IsMongoId, IsOptional, IsIn, IsString, MaxLength, IsNumber, Min } from 'class-validator';

export class ProcessPaymentDto {
  @IsMongoId()
  orderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsIn(['VNPAY', 'MOMO', 'ZALOPAY', 'CREDIT_CARD', 'vnpay', 'momo', 'mock_gateway'])
  paymentMethod?: string; // 'vnpay' | 'momo' | 'mock_gateway'

  @IsOptional()
  @IsIn(['success', 'fail'])
  action?: 'success' | 'fail'; // Cho phép mô phỏng thanh toán thành công hoặc thất bại (BR-11)
}


export class PaymentWebhookDto {
  @IsMongoId()
  orderId!: string;

  @IsString()
  @MaxLength(128)
  providerTransactionId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsIn(['SUCCESS', 'FAILED'])
  status!: 'SUCCESS' | 'FAILED';

  @IsNumber()
  timestamp!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsString()
  @MaxLength(256)
  signature!: string;
}

export class ReconcileOrderDto {
  @IsNumber()
  @Min(0)
  gatewayReportedAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  gatewaySettlementRef?: string;
}

export class PayoutOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  bankTransferRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

export class RefundOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string;
}
