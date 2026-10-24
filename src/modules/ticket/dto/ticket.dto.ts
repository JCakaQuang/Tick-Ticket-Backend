import { IsNotEmpty, IsOptional, IsString, IsMongoId, MaxLength } from 'class-validator';

export class CheckInTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  qrToken: string;

  @IsOptional()
  @IsMongoId()
  eventId?: string;
}
