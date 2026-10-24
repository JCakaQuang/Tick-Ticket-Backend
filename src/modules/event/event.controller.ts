import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventService } from './event.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../schemas/user.schema';

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  async getEvents(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.eventService.findAll({
      category,
      city,
      search,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      startDate,
      endDate,
    });
  }

  @Get('featured/special')
  async getSpecialEvents() {
    return this.eventService.getSpecialEvents();
  }

  @Get('featured/trending')
  async getTrendingEvents() {
    return this.eventService.getTrendingEvents();
  }

  @Get('recommendations')
  async getRecommendations(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
  ) {
    return this.eventService.getRecommendations({
      category,
      city,
      minPrice,
      maxPrice,
      search,
      limit,
    });
  }

  @Post('funnel/track')
  async trackFunnelStep(
    @Body()
    body: {
      step: 'VIEW_EVENT' | 'SELECT_TICKET' | 'UPSELL_ADDON' | 'CHECKOUT_INITIATED' | 'PAYMENT_SUCCESS';
      eventId?: string;
      orderId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.eventService.trackFunnelStep(body);
  }

  @Get('funnel/analytics')
  async getFunnelAnalytics() {
    return this.eventService.getFunnelAnalytics();
  }

  @Get('slug/:slug')
  async getEventBySlug(@Param('slug') slug: string) {
    return this.eventService.findBySlug(slug);
  }

  @Get(':id')
  async getEventById(@Param('id') id: string) {
    const { Types } = await import('mongoose');
    if (Types.ObjectId.isValid(id)) {
      try {
        return await this.eventService.findById(id);
      } catch {
        return this.eventService.findBySlug(id);
      }
    }
    return this.eventService.findBySlug(id);
  }

  @Get(':id/tiers')
  async getEventTiers(@Param('id') id: string) {
    const { Types } = await import('mongoose');
    let event;
    if (Types.ObjectId.isValid(id)) {
      try {
        event = await this.eventService.findById(id);
      } catch {
        event = await this.eventService.findBySlug(id);
      }
    } else {
      event = await this.eventService.findBySlug(id);
    }
    return event?.tiers || [];
  }

  @Get(':id/seats')
  async getEventSeats(@Param('id') id: string) {
    return this.eventService.getEventSeats(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  async createEvent(
    @Body() dto: CreateEventDto,
    @CurrentUser('id') organizerId: string,
  ) {
    return this.eventService.create(dto, organizerId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('id') organizerId: string,
  ) {
    return this.eventService.update(id, dto, organizerId);
  }
}