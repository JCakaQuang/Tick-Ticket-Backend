import { PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum, IsInt, Min, Max, IsNumber, IsBoolean, IsDateString, IsArray, IsMongoId, ValidateNested, IsIn, Allow, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType, EventStatus } from '../../../schemas/event.schema';
import { SeatStatus } from '../../../schemas/seat.schema';
import { TierType } from '../../../schemas/ticket-tier.schema';
import { DiscountType } from '../../../schemas/coupon.schema';

class LocationDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsString() @IsNotEmpty() @MaxLength(500) address: string;
  @IsString() @IsNotEmpty() @MaxLength(100) city: string;
}
export class CreateAdminEventDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(2048) bannerUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) posterUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) venueName?: string;
  @IsOptional() @IsString() @MaxLength(500) venueAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsDateString() saleStartTime?: string;
  @IsOptional() @IsDateString() saleEndTime?: string;
  @IsOptional() @IsEnum(EventType) type?: EventType;
  @IsOptional() @IsEnum(EventStatus) status?: EventStatus;
  @IsOptional() @IsInt() @Min(1) @Max(20) rows?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) cols?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) capacity?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) gaCapacity?: number;
  @IsOptional() @IsString() @MaxLength(100) tierName?: string;
  @IsOptional() @IsNumber() @Min(0) tierPrice?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) maxTicketsPerUser?: number;
  @IsOptional() @IsString() @MaxLength(10000) termsAndConditions?: string;
  @IsOptional() @IsString() @MaxLength(100) vnpayTmnCode?: string;
  @IsOptional() @IsString() @MaxLength(200) vnpayAccountName?: string;
  @IsOptional() @IsString() @MaxLength(200) vnpayBankName?: string;
  @IsOptional() @IsString() @MaxLength(2048) vnpayQrUrl?: string;
  @IsOptional() @IsBoolean() isSpecial?: boolean;
  @IsOptional() @IsString() @MaxLength(100) specialBadge?: string;
  @IsOptional() @IsInt() @Min(0) specialOrder?: number;
  @IsOptional() @IsBoolean() isTrending?: boolean;
  @IsOptional() @IsInt() @Min(1) trendingRank?: number;
  @IsOptional() @ValidateNested() @Type(() => LocationDto) location?: LocationDto;
}
export class UpdateAdminEventDto extends PartialType(CreateAdminEventDto) {}
export class CreateAdminTierDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(TierType) type: TierType;
  @IsNumber() @Min(0) price: number;
  @IsInt() @Min(1) totalQuantity: number;
  @IsOptional() @IsInt() @Min(0) availableQuantity?: number;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
}
export class UpdateAdminTierDto extends PartialType(CreateAdminTierDto) {}
export class CreateCouponDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code: string;
  @IsEnum(DiscountType) discountType: DiscountType;
  @IsNumber() @Min(0) discountValue: number;
  @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @IsOptional() @ValidateIf((o) => o.maxDiscountAmount !== null && o.maxDiscountAmount !== undefined) @IsNumber() @Min(0) maxDiscountAmount?: number | null;
  @IsInt() @Min(1) usageLimit: number;
  @IsDateString() validFrom: string;
  @IsDateString() validUntil: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) applicableEvents?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
export class UpdateSeatStatusDto { @IsEnum(SeatStatus) status: SeatStatus; }

export class UpdateSecuritySettingDto {
  @IsInt()
  @Min(1)
  @Max(20)
  maxFailedLoginAttempts: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  lockoutDurationMinutes: number;
}

export class TrackTrafficDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string;
}

export class RestoreBackupDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collections?: string[];

  @IsOptional()
  @IsIn(['clean', 'upsert'])
  mode?: 'clean' | 'upsert';

  @IsOptional()
  @IsBoolean()
  preserveCurrentAdmin?: boolean;

  @Allow()
  data?: any;
}

export class InspectBackupDto {
  @Allow()
  data: any;

  @IsOptional()
  @IsString()
  targetCollection?: string;
}


