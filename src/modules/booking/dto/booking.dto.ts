import {
  IsString,
  IsArray,
  IsOptional,
  IsInt,
  IsMongoId,
  ArrayUnique,
  ArrayMaxSize,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GaBookingItemDto {
  @IsMongoId()
  tierId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  quantity: number;
}

export class ReserveBookingDto {
  @IsMongoId()
  eventId: string;

  // For Seated events: list of seat IDs to hold
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(5)
  seatIds?: string[];

  // For GA events or mixed: list of tier & quantities
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GaBookingItemDto)
  gaItems?: GaBookingItemDto[];

  // Support both gaItems and items property
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GaBookingItemDto)
  items?: GaBookingItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  holdMinutes?: number;
}

export class UpsellAddonItemDto {
  @IsString()
  @MaxLength(64)
  addonCode: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @IsInt()
  @Min(0)
  unitPrice: number;
}

export class ApplyUpsellDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UpsellAddonItemDto)
  items: UpsellAddonItemDto[];
}

