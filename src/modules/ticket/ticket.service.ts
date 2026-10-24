import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Ticket, TicketDocument, TicketStatus } from '../../schemas/ticket.schema';
import { AuditLog, AuditLogDocument } from '../../schemas/audit-log.schema';
import { CheckInTicketDto } from './dto/ticket.dto';
import { ConfigService } from '@nestjs/config';
import { Event, EventDocument } from '../../schemas/event.schema';
import { UserRole } from '../../schemas/user.schema';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);
  private readonly qrSecret: string;

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    config: ConfigService,
  ) { this.qrSecret = config.getOrThrow<string>('QR_SECRET'); }

  /**
   * Validate QR signature using HMAC-SHA256
   */
  verifyQrToken(qrToken: string): { ticketId: string; eventId: string; userId: string; timestamp: number } {
    try {
      const decodedJson = Buffer.from(qrToken, 'base64').toString('utf-8');
      const payload = JSON.parse(decodedJson);
      const { tId, eId, uId, ts, sig } = payload;
      if (![tId, eId, uId].every(id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) || !Number.isSafeInteger(ts) || typeof sig !== 'string' || !/^[a-f\d]{32}$/i.test(sig)) throw new BadRequestException('Invalid QR payload');

      const rawData = `${tId}:${eId}:${uId}:${ts}`;
      const expectedSig = crypto.createHmac('sha256', this.qrSecret).update(rawData).digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig.substring(0, 32), 'hex'))) {
        throw new BadRequestException('Mã QR không hợp lệ hoặc đã bị chỉnh sửa!');
      }

      return {
        ticketId: tId,
        eventId: eId,
        userId: uId,
        timestamp: ts,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Định dạng mã QR không hợp lệ.');
    }
  }

  /**
   * Get all tickets belonging to a user
   */
  async getUserTickets(userId: string) {
    return this.ticketModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('eventId')
      .populate('tierId')
      .populate('seatId')
      .sort({ createdAt: -1 });
  }

  /**
   * Get single ticket details
   */
  async getTicketById(ticketId: string, userId: string) {
    const ticket = await this.ticketModel
      .findById(ticketId)
      .populate('eventId')
      .populate('tierId')
      .populate('seatId');

    if (!ticket) {
      throw new NotFoundException('Vé không tồn tại.');
    }

    if (ticket.userId.toString() !== userId) {
      throw new BadRequestException('Bạn không sở hữu vé này.');
    }

    return ticket;
  }

  /**
   * Public Social Share metadata for a ticket (NEVER exposes qrToken to prevent ticket theft)
   */
  async getPublicShareTicket(ticketId: string) {
    const ticket = await this.ticketModel
      .findById(ticketId)
      .populate('eventId')
      .populate('tierId')
      .populate('seatId')
      .populate('userId', 'fullName')
      .lean()
      .exec();

    if (!ticket) {
      throw new NotFoundException('Vé không tồn tại.');
    }

    const ownerName = (ticket.userId as any)?.fullName || 'Khách hàng TickTicket';
    const maskedOwner =
      ownerName.length > 3
        ? `${ownerName.slice(0, 3)}***${ownerName.slice(-1)}`
        : `${ownerName[0] || 'K'}***`;

    const eventDoc: any = ticket.eventId || {};
    const tierDoc: any = ticket.tierId || {};
    const seatDoc: any = ticket.seatId || {};
    const shareHash = crypto
      .createHmac('sha256', this.qrSecret)
      .update(`share:${String(ticket._id)}:${String(eventDoc._id || '')}`)
      .digest('hex')
      .substring(0, 16);

    return {
      ticketId: String(ticket._id),
      ticketCode: ticket.ticketCode,
      status: ticket.status,
      seatCode: seatDoc.seatCode || ticket.seatCode || 'Vé đứng (GA)',
      pricePaid: ticket.pricePaid,
      maskedOwner,
      shareVerificationHash: shareHash,
      qrProtected: true,
      event: {
        _id: eventDoc._id,
        title: eventDoc.title || 'Sự kiện TickTicket',
        slug: eventDoc.slug || '',
        bannerUrl: eventDoc.bannerUrl || '/events/special-1.webp',
        category: eventDoc.category || 'music',
        startTime: eventDoc.startTime,
        location: eventDoc.location || { name: 'Sân vận động', city: 'Việt Nam' },
      },
      tier: {
        name: tierDoc.name || 'Hạng vé tiêu chuẩn',
        type: tierDoc.type || 'ga',
      },
    };
  }

  /**
   * Atomic Check-In for event organizers/staff
   */
  async checkIn(dto: CheckInTicketDto, staffUserId: string, role: UserRole) {
    const { qrToken, eventId } = dto;
    const { ticketId, eventId: tokenEventId, userId: ticketOwner } = this.verifyQrToken(qrToken);

    if (eventId && tokenEventId !== eventId) {
      throw new BadRequestException('Vé này không thuộc sự kiện đang check-in!');
    }
    const event = await this.eventModel.findById(tokenEventId);
    if (!event) throw new NotFoundException('Event not found');
    if (role !== UserRole.ADMIN && (role !== UserRole.ORGANIZER || event.organizerId.toString() !== staffUserId)) throw new ForbiddenException('You are not assigned to this event');

    // Atomic update from VALID to USED (checked-in)
    const now = new Date();
    const updatedTicket = await this.ticketModel.db.transaction(async session => {
    const ticket = await this.ticketModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(ticketId),
        status: TicketStatus.VALID,
        eventId: tokenEventId,
        userId: ticketOwner,
        qrToken,
      },
      {
        $set: {
          status: TicketStatus.USED,
          checkedInAt: now,
          checkedInBy: new Types.ObjectId(staffUserId),
        },
      },
      { new: true, session },
    )
      .populate('eventId')
      .populate('tierId')
      .populate('seatId')
      .populate('userId', 'fullName email phone');

    if (!ticket) {
      // Check if ticket was already checked in
      const existingTicket = await this.ticketModel.findById(ticketId).session(session);
      if (!existingTicket) {
        throw new NotFoundException('Vé không tồn tại trong hệ thống.');
      }
      if (existingTicket.status === TicketStatus.USED) {
        throw new ConflictException(
          `Vé này ĐÃ ĐƯỢC CHECK-IN lúc ${existingTicket.checkedInAt ? existingTicket.checkedInAt.toLocaleTimeString('vi-VN') : ''}! Cảnh báo vé trùng!`,
        );
      }
      throw new BadRequestException(`Vé không hợp lệ để check-in (Trạng thái: ${existingTicket.status}).`);
    }

    // Record Audit Log for Check-in
      await this.auditLogModel.create([{
        action: 'TICKET_CHECKIN',
        userId: new Types.ObjectId(staffUserId),
        targetCollection: 'tickets',
        targetId: ticket._id,
        metadata: {
          ticketCode: ticket.ticketCode,
          eventId: tokenEventId,
          checkedInAt: now,
        },
      }], { session });
      return ticket;
    });

    return {
      success: true,
      message: 'Check-in thành công!',
      ticket: updatedTicket,
    };
  }
}
