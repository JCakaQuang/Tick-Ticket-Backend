import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventStatus } from '../../../schemas/event.schema';
import { TierType } from '../../../schemas/ticket-tier.schema';

export class CreateTicketTierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(TierType)
  type!: TierType;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(1)
  totalCapacity!: number;

  @IsString()
  @IsOptional()
  colorCode?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  bannerUrl!: string;

  @IsString()
  @IsOptional()
  posterUrl?: string;

  @IsString()
  @IsNotEmpty()
  venueName!: string;

  @IsString()
  @IsNotEmpty()
  venueAddress!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTicketTierDto)
  tiers!: CreateTicketTierDto[];

  @IsOptional()
  seatMapConfig?: {
    rows: number;
    cols: number;
    zones?: Array<{
      name: string;
      tierName: string;
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    }>;
  };

  @IsString()
  @IsOptional()
  vnpayTmnCode?: string;

  @IsString()
  @IsOptional()
  vnpayQrUrl?: string;

  @IsString()
  @IsOptional()
  vnpayAccountName?: string;

  @IsString()
  @IsOptional()
  vnpayBankName?: string;

  @IsBoolean()
  @IsOptional()
  isSpecial?: boolean;

  @IsString()
  @IsOptional()
  specialBadge?: string;

  @IsNumber()
  @IsOptional()
  specialOrder?: number;

  @IsBoolean()
  @IsOptional()
  isTrending?: boolean;

  @IsNumber()
  @IsOptional()
  trendingRank?: number;
}

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsString()
  @IsOptional()
  posterUrl?: string;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  vnpayTmnCode?: string;

  @IsString()
  @IsOptional()
  vnpayQrUrl?: string;

  @IsString()
  @IsOptional()
  vnpayAccountName?: string;

  @IsString()
  @IsOptional()
  vnpayBankName?: string;

  @IsBoolean()
  @IsOptional()
  isSpecial?: boolean;

  @IsString()
  @IsOptional()
  specialBadge?: string;

  @IsNumber()
  @IsOptional()
  specialOrder?: number;

  @IsBoolean()
  @IsOptional()
  isTrending?: boolean;

  @IsNumber()
  @IsOptional()
  trendingRank?: number;
}