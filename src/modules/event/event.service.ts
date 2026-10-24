import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event, EventDocument, EventStatus, EventType } from '../../schemas/event.schema';
import { TicketTier, TicketTierDocument, TierType } from '../../schemas/ticket-tier.schema';
import { Seat, SeatDocument, SeatStatus } from '../../schemas/seat.schema';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { literalSearch } from '../../common/utils/search';
import { OrderLifecycleService } from '../booking/order-lifecycle.service';

@Injectable()
export class EventService {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(TicketTier.name) private readonly tierModel: Model<TicketTierDocument>,
    @InjectModel(Seat.name) private readonly seatModel: Model<SeatDocument>,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async create(dto: CreateEventDto, organizerId: string): Promise<any> {
    const existingSlug = await this.eventModel.findOne({ slug: dto.slug }).exec();
    if (existingSlug) {
      throw new BadRequestException('Event slug already exists, please choose a unique slug');
    }

    const totalCapacity = dto.tiers.reduce((acc, t) => acc + t.totalCapacity, 0);

    const vnpayTmnCode = dto.vnpayTmnCode || `VNPAY_${dto.slug.replace(/-/g, '_').toUpperCase()}`;
    const vnpayQrUrl = dto.vnpayQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*${vnpayTmnCode}*${encodeURIComponent(dto.title)}`;

    const event = new this.eventModel({
      title: dto.title,
      slug: dto.slug,
      description: dto.description,
      category: dto.category,
      bannerUrl: dto.bannerUrl,
      posterUrl: dto.posterUrl || dto.bannerUrl,
      location: { name: dto.venueName, address: dto.venueAddress, city: dto.city },
      startTime: new Date(dto.startDate),
      endTime: new Date(dto.endDate),
      saleStartTime: new Date(),
      saleEndTime: new Date(dto.startDate),
      type: dto.tiers.some(tier => tier.type === TierType.SEATED)
        ? (dto.tiers.some(tier => tier.type === TierType.GA) ? EventType.HYBRID : EventType.SEATED)
        : EventType.GA,
      organizerId: new Types.ObjectId(organizerId),
      totalCapacity,
      status: EventStatus.PUBLISHED,
      vnpayTmnCode,
      vnpayQrUrl,
      vnpayAccountName: dto.vnpayAccountName || `BAN TO CHUC ${dto.title.toUpperCase()}`,
      vnpayBankName: dto.vnpayBankName || 'VNPAY',
      isSpecial: dto.isSpecial || false,
      specialBadge: dto.specialBadge || '',
      specialOrder: dto.specialOrder || 0,
      isTrending: dto.isTrending || false,
      trendingRank: dto.trendingRank || null,
      minPrice: (dto.tiers || []).length > 0 ? Math.min(...dto.tiers.map((t) => Number(t.price) || 0)) : 0,
      maxPrice: (dto.tiers || []).length > 0 ? Math.max(...dto.tiers.map((t) => Number(t.price) || 0)) : 0,
    });

    const savedEvent = await event.save();
    const eventId = savedEvent._id;

    // Create ticket tiers
    const tierDocs = [];
    const tierMapByName = new Map<string, Types.ObjectId>();

    for (const t of dto.tiers) {
      const tier = new this.tierModel({
        eventId,
        name: t.name,
        type: t.type,
        price: t.price,
        totalQuantity: t.totalCapacity,
        availableQuantity: t.totalCapacity,
        reservedQuantity: 0,
        soldQuantity: 0,
        color: t.colorCode || (t.type === TierType.SEATED ? '#3B82F6' : '#10B981'),
        description: t.description || '',
      });
      const savedTier = await tier.save();
      tierDocs.push(savedTier);
      tierMapByName.set(t.name, savedTier._id);
    }

    // Auto-generate seats if seated tiers exist and config provided
    if (dto.seatMapConfig && dto.seatMapConfig.rows > 0 && dto.seatMapConfig.cols > 0) {
      const seatsToInsert: Array<Partial<Seat>> = [];
      const rows = dto.seatMapConfig.rows;
      const cols = dto.seatMapConfig.cols;

      // Find primary seated tier
      const seatedTier = tierDocs.find((td) => td.type === TierType.SEATED) || tierDocs[0];

      for (let r = 1; r <= rows; r++) {
        const rowChar = String.fromCharCode(64 + r); // A, B, C...
        for (let c = 1; c <= cols; c++) {
          const seatCode = `${rowChar}-${c < 10 ? '0' + c : c}`;

          // Check if seat matches a zone
          let assignedTierId = seatedTier._id;
          let zoneName = 'Standard';

          if (dto.seatMapConfig.zones) {
            const matchedZone = dto.seatMapConfig.zones.find(
              (z) => r >= z.startRow && r <= z.endRow && c >= z.startCol && c <= z.endCol,
            );
            if (matchedZone) {
              zoneName = matchedZone.name;
              const mappedTierId = tierMapByName.get(matchedZone.tierName);
              if (mappedTierId) assignedTierId = mappedTierId;
            }
          }

          seatsToInsert.push({
            eventId: eventId as Types.ObjectId,
            tierId: assignedTierId as Types.ObjectId,
            seatCode,
            row: rowChar,
            col: c,
            zone: zoneName,
            status: SeatStatus.AVAILABLE,
          });
        }
      }

      if (seatsToInsert.length > 0) {
        await this.seatModel.insertMany(seatsToInsert);
      }
    }

    return {
      event: savedEvent,
      tiers: tierDocs,
    };
  }

  async findAll(query: {
    category?: string;
    city?: string;
    search?: string;
    status?: EventStatus;
    minPrice?: number;
    maxPrice?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    const filter: any = {};
    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = { $ne: EventStatus.DRAFT };
    }

    if (query.category && query.category !== 'ALL') {
      filter.category = literalSearch(query.category);
    }
    if (query.city) {
      filter['location.city'] = literalSearch(query.city);
    }
    if (query.startDate) {
      const date = new Date(query.startDate);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid start date');
      filter.startTime = { ...(filter.startTime || {}), $gte: date };
    }
    if (query.endDate) {
      const date = new Date(query.endDate);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid end date');
      filter.endTime = { ...(filter.endTime || {}), $lte: date };
    }
    if (query.search) {
      filter.$or = [
        { title: literalSearch(query.search) },
        { description: literalSearch(query.search) },
        { 'location.name': literalSearch(query.search) },
      ];
    }

    const events = await this.eventModel.find(filter).sort({ startTime: 1 }).lean().exec();

    // Attach tiers / calculate minPrice for price filter (UC04)
    const eventIds = events.map((e) => e._id);
    const tiers = await this.tierModel.find({ eventId: { $in: eventIds } }).lean().exec();
    const tiersByEvent = new Map<string, any[]>();
    for (const t of tiers) {
      const eid = t.eventId.toString();
      if (!tiersByEvent.has(eid)) tiersByEvent.set(eid, []);
      tiersByEvent.get(eid)!.push(t);
    }

    let result = events.map((e) => {
      const evTiers = tiersByEvent.get(e._id.toString()) || [];
      const minTierPrice =
        evTiers.length > 0 ? Math.min(...evTiers.map((t) => t.price)) : ((e as any).startingPrice || 0);
      return {
        ...e,
        seatingType: (e as any).type,
        tiers: evTiers,
        minPrice: minTierPrice,
      };
    });

    if (query.minPrice !== undefined && query.minPrice > 0) {
      result = result.filter((e) => (e.minPrice || 0) >= Number(query.minPrice));
    }
    if (query.maxPrice !== undefined && query.maxPrice > 0) {
      result = result.filter((e) => (e.minPrice || 0) <= Number(query.maxPrice));
    }

    return result;
  }

  async getSpecialEvents(): Promise<any[]> {
    const specialEvents = await this.eventModel
      .find({
        status: { $in: [EventStatus.PUBLISHED, 'PUBLISHED'] },
        isSpecial: true,
      })
      .sort({ specialOrder: 1, createdAt: -1 })
      .lean()
      .exec();

    if (specialEvents.length < 6) {
      const existingIds = specialEvents.map((e) => e._id);
      const fallbackEvents = await this.eventModel
        .find({
          status: { $in: [EventStatus.PUBLISHED, 'PUBLISHED'] },
          _id: { $nin: existingIds },
        })
        .sort({ startDate: 1 })
        .limit(6 - specialEvents.length)
        .lean()
        .exec();

      return [...specialEvents, ...fallbackEvents];
    }

    return specialEvents;
  }

  async getTrendingEvents(): Promise<any[]> {
    const trendingEvents = await this.eventModel
      .find({
        status: { $in: [EventStatus.PUBLISHED, 'PUBLISHED'] },
        isTrending: true,
      })
      .sort({ trendingRank: 1, createdAt: -1 })
      .lean()
      .exec();

    if (trendingEvents.length < 6) {
      const existingIds = trendingEvents.map((e) => e._id);
      const fallbackEvents = await this.eventModel
        .find({
          status: { $in: [EventStatus.PUBLISHED, 'PUBLISHED'] },
          _id: { $nin: existingIds },
        })
        .sort({ createdAt: -1 })
        .limit(6 - trendingEvents.length)
        .lean()
        .exec();

      return [...trendingEvents, ...fallbackEvents];
    }

    return trendingEvents;
  }

  async getRecommendations(filters?: {
    category?: string;
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    excludeIds?: string[];
    limit?: number;
  }) {
    const candidates = await this.eventModel
      .find({ status: { $in: [EventStatus.PUBLISHED, 'PUBLISHED'] } })
      .sort({ isTrending: -1, isSpecial: -1, startTime: 1 })
      .limit(30)
      .lean()
      .exec();

    const eventIds = candidates.map((e) => e._id);
    const tiers = await this.tierModel.find({ eventId: { $in: eventIds } }).lean().exec();
    const tiersByEvent = new Map<string, any[]>();
    for (const t of tiers) {
      const key = String(t.eventId);
      const arr = tiersByEvent.get(key) || [];
      arr.push(t);
      tiersByEvent.set(key, arr);
    }

    const excludeSet = new Set((filters?.excludeIds || []).map(String));
    const desiredCategory = filters?.category && filters.category !== 'ALL' ? filters.category.toLowerCase() : '';
    const desiredCity = filters?.city && filters.city !== 'ALL' ? filters.city.toLowerCase() : '';
    const desiredMaxPrice =
      filters?.maxPrice !== undefined && !isNaN(Number(filters.maxPrice)) && Number(filters.maxPrice) > 0
        ? Number(filters.maxPrice)
        : undefined;
    const desiredMinPrice =
      filters?.minPrice !== undefined && !isNaN(Number(filters.minPrice)) && Number(filters.minPrice) > 0
        ? Number(filters.minPrice)
        : undefined;

    const scored = candidates
      .filter((ev) => !excludeSet.has(String(ev._id)))
      .map((ev: any) => {
        const evTiers = tiersByEvent.get(String(ev._id)) || [];
        const price =
          evTiers.length > 0
            ? Math.min(...evTiers.map((t) => Number(t.price) || 0))
            : Number(ev.minPrice || 0);
        let score = 0;
        const reasons: string[] = [];

        if (desiredCategory && (ev.category || '').toLowerCase() === desiredCategory) {
          score += 40;
          reasons.push('Cùng thể loại');
        }
        if (desiredCity && (ev.location?.city || '').toLowerCase().includes(desiredCity)) {
          score += 30;
          reasons.push(`Tại ${ev.location?.city}`);
        }
        if (desiredMaxPrice !== undefined && price > 0) {
          if (price <= desiredMaxPrice) {
            score += 20;
            reasons.push('Trong ngân sách của bạn');
          } else if (price <= desiredMaxPrice * 1.3) {
            score += 12;
            reasons.push('Mức giá tương đương');
          }
        } else if (desiredMinPrice !== undefined && price >= desiredMinPrice * 0.7) {
          score += 12;
          reasons.push('Phân khúc vé phù hợp');
        }
        if (ev.isTrending) {
          score += 10;
          reasons.push('Xu hướng nổi bật');
        } else if (ev.isSpecial) {
          score += 8;
          reasons.push('Sự kiện đặc biệt');
        }
        if (ev.startTime && new Date(ev.startTime).getTime() > Date.now()) {
          score += 5;
        }
        if (reasons.length === 0) {
          reasons.push('Sự kiện đang mở bán nổi bật');
        }
        return {
          ...ev,
          seatingType: ev.type,
          minPrice: price,
          lowestPrice: price,
          tiers: evTiers,
          recommendationScore: score,
          recommendationReasons: reasons,
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore);

    const limit = Math.min(Math.max(Number(filters?.limit) || 6, 1), 12);
    return {
      recommendations: scored.slice(0, limit),
      strategy: 'MULTI_STAGE_CONSTRAINT_RELAXATION',
      relaxedConstraints: [
        ...(desiredCategory ? ['category'] : []),
        ...(desiredCity ? ['city'] : []),
        ...(desiredMaxPrice !== undefined || desiredMinPrice !== undefined ? ['priceRange'] : []),
      ],
    };
  }

  private readonly funnelCounters: Record<string, number> = {
    VIEW_EVENT: 0,
    SELECT_TICKET: 0,
    UPSELL_ADDON: 0,
    CHECKOUT_INITIATED: 0,
    PAYMENT_SUCCESS: 0,
  };

  trackFunnelStep(payload: {
    step: 'VIEW_EVENT' | 'SELECT_TICKET' | 'UPSELL_ADDON' | 'CHECKOUT_INITIATED' | 'PAYMENT_SUCCESS';
    eventId?: string;
    orderId?: string;
    metadata?: Record<string, any>;
  }) {
    if (this.funnelCounters[payload.step] !== undefined) {
      this.funnelCounters[payload.step] += 1;
    }
    return {
      recorded: true,
      step: payload.step,
      counters: { ...this.funnelCounters },
    };
  }

  getFunnelAnalytics() {
    const views = Math.max(this.funnelCounters.VIEW_EVENT, 1);
    return {
      steps: { ...this.funnelCounters },
      conversionRates: {
        viewToSelectRate: Number(((this.funnelCounters.SELECT_TICKET / views) * 100).toFixed(2)),
        selectToUpsellRate: Number(
          ((this.funnelCounters.UPSELL_ADDON / Math.max(this.funnelCounters.SELECT_TICKET, 1)) * 100).toFixed(2),
        ),
        checkoutToPurchaseRate: Number(
          ((this.funnelCounters.PAYMENT_SUCCESS / Math.max(this.funnelCounters.CHECKOUT_INITIATED, 1)) * 100).toFixed(2),
        ),
        overallConversionRate: Number(((this.funnelCounters.PAYMENT_SUCCESS / views) * 100).toFixed(2)),
      },
    };
  }

  async findBySlug(slug: string): Promise<any> {
    const event = await this.eventModel.findOne({ slug }).lean().exec();
    if (!event) {
      throw new NotFoundException(`Event with slug '${slug}' not found`);
    }

    const tiers = await this.tierModel.find({ eventId: event._id }).lean().exec();
    return {
      ...event,
     seatingType: (event as any).type,
      tiers,
    };
  }

  async findById(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid event ID');
    }
    const event = await this.eventModel.findById(id).lean().exec();
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const tiers = await this.tierModel.find({ eventId: event._id }).lean().exec();
    return {
      ...event,
     seatingType: (event as any).type,
      tiers,
    };
  }

  async getEventSeats(eventId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    // Lazy expiration layer: seats reserved whose reservedUntil < now are expired
    await this.lifecycle.expireForEvent(eventId);

    return this.seatModel
      .find({ eventId: new Types.ObjectId(eventId) })
      .populate('tierId', 'name price color type')
      .sort({ row: 1, col: 1 })
      .lean()
      .exec();
  }

  async update(id: string, dto: UpdateEventDto, organizerId: string) {
    const event = await this.eventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.organizerId.toString() !== organizerId) {
      throw new ForbiddenException('You are not authorized to update this event');
    }

    Object.assign(event, dto);
    if (dto.startDate) event.startTime = new Date(dto.startDate);
    if (dto.endDate) event.endTime = new Date(dto.endDate);
    return event.save();
  }
}
