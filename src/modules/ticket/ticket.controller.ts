import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CheckInTicketDto } from './dto/ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../schemas/user.schema';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get('share/:id')
  async getPublicShareTicket(@Param('id', ObjectIdPipe) id: string) {
    return this.ticketService.getPublicShareTicket(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-tickets')
  async getMyTickets(@CurrentUser('userId') userId: string) {
    return this.ticketService.getUserTickets(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getTicketDetails(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ticketService.getTicketById(id, userId);
  }

  @Post('check-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async checkInTicket(
    @Body() dto: CheckInTicketDto,
    @CurrentUser('userId') staffUserId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.ticketService.checkIn(dto, staffUserId, role);
  }
}
