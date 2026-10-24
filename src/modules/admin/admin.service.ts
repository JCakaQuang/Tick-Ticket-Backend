import { literalSearch } from '../../common/utils/search';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../../schemas/user.schema';
import { Event, EventDocument } from '../../schemas/event.schema';
import { TicketTier, TicketTierDocument, TierType } from '../../schemas/ticket-tier.schema';
import { Seat, SeatDocument, SeatStatus } from '../../schemas/seat.schema';
import { Order, OrderDocument, OrderStatus } from '../../schemas/order.schema';
import { Ticket, TicketDocument } from '../../schemas/ticket.schema';
import { Coupon, CouponDocument, DiscountType } from '../../schemas/coupon.schema';
import { AuditLog, AuditLogDocument } from '../../schemas/audit-log.schema';
import { SystemSetting, SystemSettingDocument } from '../../schemas/system-setting.schema';
import { TrafficService } from '../traffic/traffic.service';
import { RestoreBackupDto } from './dto/admin.dto';

export const BACKUP_COLLECTIONS_META = [
  { name: 'users', label: 'Tài khoản người dùng & Quản trị', description: 'Thông tin người dùng, quyền Admin/Organizer/User, mật khẩu băm', critical: true },
  { name: 'events', label: 'Sự kiện biểu diễn', description: 'Thông tin sự kiện, địa điểm, banner, poster, thời gian mở bán', critical: true },
  { name: 'ticket_tiers', label: 'Hạng vé sự kiện', description: 'Phân loại vé (VIP, GA, Standard), giá bán, số lượng mở bán', critical: true },
  { name: 'seats', label: 'Sơ đồ ghế & Trạng thái', description: 'Tọa độ hàng/cột, trạng thái ghế (Trống, Đã khóa, Đã bán)', critical: false },
  { name: 'orders', label: 'Đơn hàng & Giao dịch', description: 'Lịch sử mua vé, tổng tiền thanh toán, trạng thái thanh toán', critical: true },
  { name: 'tickets', label: 'Vé điện tử & Check-in', description: 'Mã vé định danh, hash mã QR code check-in, trạng thái sử dụng', critical: true },
  { name: 'coupons', label: 'Mã giảm giá & Khuyến mãi', description: 'Mã voucher, tỷ lệ giảm giá, hạn sử dụng, số lần đã áp dụng', critical: false },
  { name: 'system_settings', label: 'Cấu hình bảo mật hệ thống', description: 'Giới hạn lần nhập sai mật khẩu, thời gian tạm khóa tài khoản', critical: false },
  { name: 'traffic_logs', label: 'Lưu lượng truy cập Web', description: 'Nhật ký truy cập, IP, thiết bị, trình duyệt của người dùng', critical: false },
  { name: 'audit_logs', label: 'Nhật ký kiểm toán & Hoạt động', description: 'Lịch sử thao tác quan trọng của Quản trị viên và hệ thống', critical: false },
] as const;

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(TicketTier.name) private ticketTierModel: Model<TicketTierDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(SystemSetting.name) private systemSettingModel: Model<SystemSettingDocument>,
    @InjectConnection() private connection: Connection,
    private trafficService: TrafficService,
  ) {}



  // 1. DASHBOARD OVERVIEW
  async getDashboardStats() {
    const [
      totalUsers,
      totalEvents,
      totalOrders,
      confirmedOrders,
      totalTicketsIssued,
      totalCoupons,
      recentOrders,
      recentLogs,
      trafficData,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.USER }),
      this.eventModel.countDocuments(),
      this.orderModel.countDocuments(),
      this.orderModel.find({ status: OrderStatus.PAID }),
      this.ticketModel.countDocuments(),
      this.couponModel.countDocuments(),
      this.orderModel
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('eventId', 'title')
        .populate('userId', 'fullName email')
        .exec(),
      this.auditLogModel
        .find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'fullName email')
        .exec(),
      this.trafficService.getTrafficStats().catch(() => null),
    ]);

    const totalRevenue = confirmedOrders.reduce(
      (sum, o) => sum + (o.totalAmount || o.subtotal || 0),
      0,
    );

    return {
      stats: {
        totalRevenue,
        totalUsers,
        totalEvents,
        totalOrders,
        confirmedOrdersCount: confirmedOrders.length,
        paidOrdersCount: confirmedOrders.length,
        totalTicketsIssued,
        totalCoupons,
        todayTrafficViews: trafficData?.overview?.todayViews || 0,
        todayTrafficVisitors: trafficData?.overview?.todayUniqueVisitors || 0,
        yearTrafficViews: trafficData?.overview?.yearViews || 0,
        totalTrafficViews: trafficData?.overview?.totalViews || 0,
      },
      recentOrders,
      recentLogs,
      traffic: trafficData,
    };
  }

  // 2. USER MANAGEMENT
  async getUsers(search?: string, role?: string, isActive?: string) {
    const query: any = {};
    if (search) {
      query.$or = [
        { fullName: literalSearch(search) },
        { email: literalSearch(search) },
        { phoneNumber: literalSearch(search) },
      ];
    }
    if (role) query.role = role;
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    return this.userModel.find(query).select('-passwordHash +failedLoginAttempts +lockedUntil').sort({ createdAt: -1 }).exec();
  }


  async toggleUserStatus(userId: string, adminId: string) {
    const user = await this.userModel.findById(userId).select('+tokenVersion');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Không thể khóa tài khoản Quản trị viên.');
    }

    user.isActive = !user.isActive;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: user.isActive ? 'UNLOCK_USER' : 'LOCK_USER',
      targetCollection: 'users',
      targetId: user._id,
      metadata: { targetUserEmail: user.email, newStatus: user.isActive },
    });

    return {
      success: true,
      message: user.isActive ? 'Đã mở khóa tài khoản thành công.' : 'Đã khóa tài khoản thành công.',
      user: { ...user.toObject(), tokenVersion: undefined },
    };
  }

  // 3. EVENT MANAGEMENT
  async getEvents(search?: string, status?: string) {
    const query: any = {};
    if (search) query.title = literalSearch(search);
    if (status) query.status = status;
    const events = await this.eventModel.find(query).sort({ startTime: 1 }).lean().exec();
    return events.map((e: any) => ({
      ...e,
      seatingType: e.type,
    }));
  }

  async createEvent(data: any, adminId: string) {
    const slug = data.slug || data.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const vnpayTmnCode = data.vnpayTmnCode || `VNPAY_${slug.replace(/-/g, '_').toUpperCase()}`;
    const vnpayQrUrl = data.vnpayQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*${vnpayTmnCode}*${encodeURIComponent(data.title || 'TICKET')}`;

    const location = data.location || {
      name: data.venueName || 'Nhà hát Hòa Bình',
      address: data.venueAddress || '240 đường 3/2, Quận 10',
      city: data.city || 'TP. Hồ Chí Minh',
      coordinates: data.coordinates || { lat: 10.7769, lng: 106.6783 },
    };

    const eventType = data.type === 'GA' ? 'GA' : 'SEATED';

    const event = await this.eventModel.create({
      title: data.title,
      slug,
      description: data.description || `Sự kiện ${data.title}`,
      category: data.category || 'CONCERT',
      bannerUrl: data.bannerUrl || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80',
      posterUrl: data.posterUrl || data.bannerUrl,
      location,
      startTime: data.startTime ? new Date(data.startTime) : new Date(Date.now() + 7 * 86400000),
      endTime: data.endTime ? new Date(data.endTime) : new Date(Date.now() + 8 * 86400000),
      saleStartTime: data.saleStartTime ? new Date(data.saleStartTime) : new Date(),
      saleEndTime: data.saleEndTime ? new Date(data.saleEndTime) : (data.startTime ? new Date(data.startTime) : new Date(Date.now() + 7 * 86400000)),
      type: eventType,
      status: data.status || 'PUBLISHED',
      vnpayTmnCode,
      vnpayQrUrl,
      vnpayAccountName: data.vnpayAccountName || `BAN TO CHUC ${(data.title || 'SU KIEN').toUpperCase()}`,
      vnpayBankName: data.vnpayBankName || 'VNPAY',
      organizerId: new Types.ObjectId(adminId),
      maxTicketsPerUser: Math.min(Math.max(Number(data.maxTicketsPerUser) || 5, 1), 5),
      termsAndConditions: data.termsAndConditions || '',
      isSpecial: Boolean(data.isSpecial),
      specialBadge: data.specialBadge || '',
      specialOrder: Number(data.specialOrder) || 0,
      isTrending: Boolean(data.isTrending),
      trendingRank: data.trendingRank ? Number(data.trendingRank) : null,
      soldCount: 0,
    });

    // Auto-generate Tiers and Seats based on Event Type & Seat Map Configuration
    if (eventType === 'SEATED') {
      const rows = Math.min(Math.max(Number(data.rows || 5), 1), 20);
      const cols = Math.min(Math.max(Number(data.cols || 10), 1), 30);
      const totalSeats = rows * cols;
      const tierPrice = Number(data.tierPrice || 500000);
      const tierName = data.tierName || 'Vé Ngồi Tiêu Chuẩn';

      const tier = await this.ticketTierModel.create({
        eventId: event._id,
        name: tierName,
        type: TierType.SEATED,
        price: tierPrice,
        totalQuantity: totalSeats,
        availableQuantity: totalSeats,
        reservedQuantity: 0,
        soldQuantity: 0,
        color: '#3B82F6',
        description: `Hạng vé ngồi khán đài (${rows} hàng x ${cols} ghế)`,
      });

      const seatsToInsert: any[] = [];
      for (let r = 1; r <= rows; r++) {
        const rowChar = String.fromCharCode(64 + r); // A, B, C...
        for (let c = 1; c <= cols; c++) {
          const seatCode = `${rowChar}-${c < 10 ? '0' + c : c}`;
          seatsToInsert.push({
            eventId: event._id,
            tierId: tier._id,
            seatCode,
            row: rowChar,
            col: c,
            zone: 'Khán Đài Chính',
            status: SeatStatus.AVAILABLE,
          });
        }
      }
      if (seatsToInsert.length > 0) {
        await this.seatModel.insertMany(seatsToInsert);
      }
    } else {
      // General Admission (Vé đứng)
      const capacity = Number(data.capacity || 500);
      const tierPrice = Number(data.tierPrice || 350000);
      const tierName = data.tierName || 'Vé Đứng Fanzone (GA)';

      await this.ticketTierModel.create({
        eventId: event._id,
        name: tierName,
        type: TierType.GA,
        price: tierPrice,
        totalQuantity: capacity,
        availableQuantity: capacity,
        reservedQuantity: 0,
        soldQuantity: 0,
        color: '#10B981',
        description: `Khu vực vé đứng tự do, tối đa ${capacity} khán giả`,
      });
    }

    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'CREATE_EVENT',
      targetCollection: 'events',
      targetId: event._id,
      metadata: { title: event.title, slug, vnpayTmnCode, vnpayQrUrl, type: eventType, category: event.category },
    });
    return event;
  }

  async updateEvent(id: string, data: any, adminId: string) {
    const event = await this.eventModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện');
    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'UPDATE_EVENT',
      targetCollection: 'events',
      targetId: event._id,
      metadata: { updatedFields: Object.keys(data) },
    });
    return event;
  }

  async deleteEvent(id: string, adminId: string) {
    const event = await this.eventModel.findByIdAndDelete(id);
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện');
    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'DELETE_EVENT',
      targetCollection: 'events',
      targetId: new Types.ObjectId(id),
      metadata: { title: event.title },
    });
    return { success: true, message: 'Đã xóa sự kiện thành công.' };
  }

  // 4. TICKET TIER MANAGEMENT
  async getEventTiers(eventId: string) {
    return this.ticketTierModel.find({ eventId: new Types.ObjectId(eventId) }).exec();
  }

  async createTier(eventId: string, data: any) {
    return this.ticketTierModel.create({ ...data, eventId: new Types.ObjectId(eventId), soldQuantity: 0 });
  }

  async updateTier(tierId: string, data: any) {
    return this.ticketTierModel.findByIdAndUpdate(tierId, data, { new: true, runValidators: true });
  }

  async deleteTier(tierId: string) {
    return this.ticketTierModel.findByIdAndDelete(tierId);
  }

  // 5. SEAT MANAGEMENT
  async getEventSeats(eventId: string) {
    return this.seatModel.find({ eventId: new Types.ObjectId(eventId) }).sort({ section: 1, row: 1, seatNumber: 1 }).exec();
  }

  async updateSeatStatus(seatId: string, status: SeatStatus, adminId: string) {
    const seat = await this.seatModel.findById(seatId);
    if (!seat) throw new NotFoundException('Không tìm thấy ghế');
    const oldStatus = seat.status;
    seat.status = status;
    if (status === SeatStatus.AVAILABLE) {
      seat.reservedBy = null;
      seat.reservedUntil = null;
      seat.orderId = null;
    }
    await seat.save();
    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'UPDATE_SEAT_STATUS',
      targetCollection: 'seats',
      targetId: seat._id,
      metadata: { seatCode: seat.seatCode, oldStatus, newStatus: status },
    });
    return seat;
  }

  // 6. ORDER MANAGEMENT
  async getOrders(search?: string, status?: string) {
    const query: any = {};
    if (status) query.status = status;
    const orders = await this.orderModel
      .find(query)
      .populate('eventId', 'title date')
      .populate('userId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 })
      .exec();

    if (search) {
      const q = search.toLowerCase();
      return orders.filter((o: any) => {
        const code = o.orderCode?.toLowerCase() || '';
        const email = o.userId?.email?.toLowerCase() || '';
        const name = o.userId?.fullName?.toLowerCase() || '';
        return code.includes(q) || email.includes(q) || name.includes(q);
      });
    }
    return orders;
  }

  // 6.1 PAYMENT MANAGEMENT (UC21)
  async getPayments(search?: string, status?: string) {
    const query: any = {};
    if (status) query.status = status;
    const payments = await this.orderModel
      .find(query)
      .select('orderCode paymentTransactionId paymentMethod paidAt status totalAmount subtotal discountAmount createdAt updatedAt')
      .populate('eventId', 'title')
      .populate('userId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 })
      .exec();

    if (search) {
      const q = search.toLowerCase();
      return payments.filter((p: any) => {
        const txn = p.paymentTransactionId?.toLowerCase() || '';
        const code = p.orderCode?.toLowerCase() || '';
        const email = p.userId?.email?.toLowerCase() || '';
        const name = p.userId?.fullName?.toLowerCase() || '';
        const method = p.paymentMethod?.toLowerCase() || '';
        return txn.includes(q) || code.includes(q) || email.includes(q) || name.includes(q) || method.includes(q);
      });
    }
    return payments;
  }

  // 7. COUPONS & AUDIT LOGS
  async getCoupons() {
    return this.couponModel
      .find()
      .populate('applicableEvents', 'title slug')
      .sort({ createdAt: -1 })
      .exec();
  }

  async createCoupon(data: any, adminId: string) {
    const code = data.code?.toUpperCase().trim();
    if (!code) throw new BadRequestException('Mã ưu đãi không được để trống.');
    const existing = await this.couponModel.findOne({ code });
    if (existing) throw new BadRequestException('Mã ưu đãi đã tồn tại.');

    const couponData: any = {
      ...data,
      code,
      usedCount: 0,
      validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
      validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 30 * 86400000),
    };

    if (Array.isArray(data.applicableEvents)) {
      couponData.applicableEvents = data.applicableEvents
        .filter((id: string) => id && Types.ObjectId.isValid(id))
        .map((id: string) => new Types.ObjectId(id));
    }

    if (couponData.discountType === DiscountType.FIXED_AMOUNT) {
      couponData.maxDiscountAmount = null;
    }

    const coupon = await this.couponModel.create(couponData);

    if (adminId && Types.ObjectId.isValid(adminId)) {
      await this.auditLogModel.create({
        userId: new Types.ObjectId(adminId),
        action: 'CREATE_COUPON',
        targetCollection: 'coupons',
        targetId: coupon._id,
        metadata: { code, discountType: coupon.discountType, discountValue: coupon.discountValue },
      });
    }

    return coupon;
  }

  async updateCoupon(id: string, data: any, adminId?: string) {
    if (data.code) {
      data.code = data.code.toUpperCase().trim();
      const existing = await this.couponModel.findOne({
        code: data.code,
        _id: { $ne: new Types.ObjectId(id) },
      });
      if (existing) throw new BadRequestException('Mã ưu đãi đã tồn tại.');
    }

    const updateData: any = { ...data };

    if (data.validFrom) updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil) updateData.validUntil = new Date(data.validUntil);

    if (Array.isArray(data.applicableEvents)) {
      updateData.applicableEvents = data.applicableEvents
        .filter((eventId: string) => eventId && Types.ObjectId.isValid(eventId))
        .map((eventId: string) => new Types.ObjectId(eventId));
    }

    if (updateData.discountType === DiscountType.FIXED_AMOUNT) {
      updateData.maxDiscountAmount = null;
    }

    const updated = await this.couponModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate('applicableEvents', 'title slug');

    if (!updated) throw new NotFoundException('Không tìm thấy mã ưu đãi.');

    if (adminId && Types.ObjectId.isValid(adminId)) {
      await this.auditLogModel.create({
        userId: new Types.ObjectId(adminId),
        action: 'UPDATE_COUPON',
        targetCollection: 'coupons',
        targetId: updated._id,
        metadata: { code: updated.code, updates: data },
      });
    }

    return updated;
  }

  async deleteCoupon(id: string, adminId?: string) {
    const deleted = await this.couponModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Không tìm thấy mã ưu đãi.');

    if (adminId && Types.ObjectId.isValid(adminId)) {
      await this.auditLogModel.create({
        userId: new Types.ObjectId(adminId),
        action: 'DELETE_COUPON',
        targetCollection: 'coupons',
        targetId: new Types.ObjectId(id),
        metadata: { code: deleted.code },
      });
    }

    return deleted;
  }

  async getAuditLogs(limit = 100) {
    return this.auditLogModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'fullName email role')
      .exec();
  }

  // 8. SECURITY SETTINGS & LOGIN RESTRICTIONS
  async getSecuritySettings() {
    let setting = await this.systemSettingModel.findOne({ key: 'security' }).lean().exec();
    if (!setting) {
      setting = await this.systemSettingModel.create({
        key: 'security',
        maxFailedLoginAttempts: 5,
        lockoutDurationMinutes: 15,
      });
    }
    return {
      maxFailedLoginAttempts: setting.maxFailedLoginAttempts ?? 5,
      lockoutDurationMinutes: setting.lockoutDurationMinutes ?? 15,
      updatedAt: setting.updatedAt,
    };
  }

  async updateSecuritySettings(dto: { maxFailedLoginAttempts: number; lockoutDurationMinutes: number }, adminId: string) {
    const maxAttempts = Number(dto.maxFailedLoginAttempts);
    const duration = Number(dto.lockoutDurationMinutes);

    if (!maxAttempts || maxAttempts < 1 || maxAttempts > 20) {
      throw new BadRequestException('Số lần nhập mật khẩu sai tối đa phải từ 1 đến 20 lần');
    }
    if (!duration || duration < 1 || duration > 1440) {
      throw new BadRequestException('Thời gian tạm khóa phải từ 1 đến 1440 phút');
    }

    const updated = await this.systemSettingModel.findOneAndUpdate(
      { key: 'security' },
      {
        $set: {
          maxFailedLoginAttempts: maxAttempts,
          lockoutDurationMinutes: duration,
          updatedBy: new Types.ObjectId(adminId),
        },
      },
      { upsert: true, new: true },
    );

    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'UPDATE_SECURITY_SETTINGS',
      targetCollection: 'system_settings',
      targetId: updated._id,
      metadata: {
        maxFailedLoginAttempts: maxAttempts,
        lockoutDurationMinutes: duration,
      },
    });

    return {
      success: true,
      message: 'Cập nhật giới hạn mật khẩu và thời gian tạm khóa thành công!',
      settings: {
        maxFailedLoginAttempts: updated.maxFailedLoginAttempts,
        lockoutDurationMinutes: updated.lockoutDurationMinutes,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async unlockUserLogin(userId: string, adminId: string) {
    const user = await this.userModel.findById(userId).select('+failedLoginAttempts +lockedUntil');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await this.auditLogModel.create({
      userId: new Types.ObjectId(adminId),
      action: 'UNLOCK_USER_LOGIN',
      targetCollection: 'users',
      targetId: user._id,
      metadata: { targetUserEmail: user.email },
    });

    return {
      success: true,
      message: `Đã mở khóa đăng nhập và đặt lại số lần nhập sai cho ${user.fullName} (${user.email}).`,
    };
  }

  // 9. TRAFFIC STATISTICS
  async getTrafficStats(filter?: 'all' | 'real' | 'sample') {
    return this.trafficService.getTrafficStats(filter);
  }

  async clearSampleTraffic() {
    return this.trafficService.clearSampleTraffic();
  }

  async seedSampleTraffic() {
    return this.trafficService.seedSampleTraffic(true);
  }

  // 10. DATABASE BACKUP & RESTORE
  private normalizeDocumentValue(val: any, key = ''): any {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) {
      return val.map((item) => this.normalizeDocumentValue(item, key));
    }
    if (typeof val === 'object') {
      if (val instanceof Types.ObjectId || val instanceof Date) return val;
      if (val.$oid && typeof val.$oid === 'string' && Types.ObjectId.isValid(val.$oid)) {
        return new Types.ObjectId(val.$oid);
      }
      if (val.$date) {
        const d = new Date(val.$date);
        if (!isNaN(d.getTime())) return d;
      }
      if (val.$numberInt !== undefined) return parseInt(val.$numberInt, 10);
      if (val.$numberLong !== undefined) return parseInt(val.$numberLong, 10);
      if (val.$numberDouble !== undefined) return parseFloat(val.$numberDouble);

      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = this.normalizeDocumentValue(v, k);
      }
      return out;
    }
    if (typeof val === 'string') {
      const isIdKey =
        key === '_id' ||
        key.endsWith('Id') ||
        ['eventId', 'userId', 'tierId', 'seatId', 'orderId', 'updatedBy', 'applicableEvents', 'seats'].includes(key);
      if (isIdKey && /^[0-9a-fA-F]{24}$/.test(val)) {
        return new Types.ObjectId(val);
      }
      const isDateKey =
        /date|time|at$/i.test(key) ||
        [
          'startTime',
          'endTime',
          'saleStartTime',
          'saleEndTime',
          'validFrom',
          'validUntil',
          'expiresAt',
          'paidAt',
          'lockedUntil',
          'lastFailedLoginAt',
          'checkInTime',
        ].includes(key);
      if (isDateKey && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return val;
  }

  async getBackupOverview() {
    const db = this.connection.db;
    const collectionsOverview = await Promise.all(
      BACKUP_COLLECTIONS_META.map(async (meta) => {
        let count = 0;
        try {
          count = await db.collection(meta.name).countDocuments();
        } catch {
          count = 0;
        }
        return {
          ...meta,
          count,
        };
      }),
    );

    const totalDocuments = collectionsOverview.reduce((sum, c) => sum + c.count, 0);

    const lastBackupLog = await this.auditLogModel
      .findOne({ action: 'DATABASE_BACKUP_EXPORT' })
      .sort({ createdAt: -1 })
      .populate('userId', 'fullName email')
      .exec();

    const lastRestoreLog = await this.auditLogModel
      .findOne({ action: 'DATABASE_RESTORE' })
      .sort({ createdAt: -1 })
      .populate('userId', 'fullName email')
      .exec();

    return {
      databaseName: db.databaseName,
      serverTime: new Date().toISOString(),
      totalCollections: BACKUP_COLLECTIONS_META.length,
      totalDocuments,
      collections: collectionsOverview,
      lastBackup: lastBackupLog
        ? {
            time: lastBackupLog.createdAt,
            admin: (lastBackupLog.userId as any)?.fullName || 'Quản trị viên',
            adminEmail: (lastBackupLog.userId as any)?.email,
            details: lastBackupLog.metadata,
          }
        : null,
      lastRestore: lastRestoreLog
        ? {
            time: lastRestoreLog.createdAt,
            admin: (lastRestoreLog.userId as any)?.fullName || 'Quản trị viên',
            adminEmail: (lastRestoreLog.userId as any)?.email,
            details: lastRestoreLog.metadata,
          }
        : null,
    };
  }

  async exportBackup(collectionsQuery?: string, adminId?: string) {
    const db = this.connection.db;
    const allowedNames = BACKUP_COLLECTIONS_META.map((c) => c.name as string);

    let targetCollections: string[] = [];
    if (collectionsQuery && collectionsQuery.trim()) {
      const requested = collectionsQuery
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      targetCollections = requested.filter((name) => allowedNames.includes(name));
    }
    if (targetCollections.length === 0) {
      targetCollections = allowedNames;
    }

    const startedAt = new Date();
    const summary: Record<string, number> = {};
    let totalDocs = 0;
    const collectionsData: Record<string, any[]> = {};

    for (const name of targetCollections) {
      const rawDocs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      const serializedDocs = rawDocs.map((doc) =>
        mongoose.mongo.BSON.EJSON.serialize(doc, { relaxed: false }),
      );
      collectionsData[name] = serializedDocs;
      summary[name] = serializedDocs.length;
      totalDocs += serializedDocs.length;
    }

    const manifest = {
      $schema: 'https://tickticket.vn/schemas/backup-v1.json',
      format: 'mongodb-ejson-canonical',
      version: 1,
      exportedAt: startedAt.toISOString(),
      database: db.databaseName,
      exportedBy: adminId || 'admin',
      summary: {
        totalCollections: targetCollections.length,
        totalDocuments: totalDocs,
        collectionCounts: summary,
      },
      collections: collectionsData,
    };

    if (adminId && Types.ObjectId.isValid(adminId)) {
      await this.auditLogModel
        .create({
          userId: new Types.ObjectId(adminId),
          action: 'DATABASE_BACKUP_EXPORT',
          targetCollection: 'database',
          metadata: {
            exportedCollections: targetCollections,
            totalDocuments: totalDocs,
            summary,
          },
        })
        .catch((err) => console.error('Error logging export audit:', err.message));
    }

    return manifest;
  }
  inspectBackup(payload: any, targetCollection?: string) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Nội dung file JSON không hợp lệ hoặc rỗng.');
    }

    const allowedNames = BACKUP_COLLECTIONS_META.map((c) => c.name as string);
    const detected: Array<{
      name: string;
      label: string;
      count: number;
      sample?: any;
    }> = [];
    const warnings: string[] = [];

    let collectionsMap: Record<string, any[]> = {};
    const version = payload.version || 1;
    const exportedAt = payload.exportedAt || null;
    const database = payload.database || null;
    const format = payload.format || 'standard-json';

    if (payload.collections && typeof payload.collections === 'object') {
      collectionsMap = payload.collections;
    } else if (Array.isArray(payload)) {
      if (targetCollection && allowedNames.includes(targetCollection)) {
        collectionsMap[targetCollection] = payload;
      } else {
        warnings.push('File JSON chứa danh sách mảng tài liệu nhưng chưa chỉ định collection mục tiêu.');
      }
    } else if (payload.data && Array.isArray(payload.data) && payload.collection) {
      collectionsMap[payload.collection] = payload.data;
    } else {
      for (const key of Object.keys(payload)) {
        if (allowedNames.includes(key) && Array.isArray(payload[key])) {
          collectionsMap[key] = payload[key];
        }
      }
    }

    let totalDocuments = 0;
    for (const name of allowedNames) {
      if (collectionsMap[name] && Array.isArray(collectionsMap[name])) {
        const docs = collectionsMap[name];
        const meta = BACKUP_COLLECTIONS_META.find((c) => c.name === name);
        detected.push({
          name,
          label: meta?.label || name,
          count: docs.length,
          sample: docs[0] ? Object.keys(docs[0]).slice(0, 6) : [],
        });
        totalDocuments += docs.length;
      }
    }

    if (detected.length === 0) {
      warnings.push('Không nhận diện được collection hợp lệ nào từ file backup này.');
    }

    return {
      valid: detected.length > 0,
      version,
      exportedAt,
      database,
      format,
      detectedCollections: detected,
      totalDocuments,
      warnings,
    };
  }

  async restoreBackup(dto: RestoreBackupDto, adminId?: string) {
    const { data, mode = 'clean', preserveCurrentAdmin = true } = dto;
    if (!data) {
      throw new BadRequestException('Dữ liệu khôi phục không được để trống.');
    }

    const inspection = this.inspectBackup(data);
    if (!inspection.valid || inspection.detectedCollections.length === 0) {
      throw new BadRequestException('Không tìm thấy dữ liệu collection hợp lệ để khôi phục.');
    }

    const requestedCollections =
      dto.collections && dto.collections.length > 0
        ? dto.collections
        : inspection.detectedCollections.map((c) => c.name);

    const targetCollectionNames = requestedCollections.filter((name) =>
      inspection.detectedCollections.some((c) => c.name === name),
    );

    if (targetCollectionNames.length === 0) {
      throw new BadRequestException('Không có collection nào được chọn để khôi phục.');
    }

    const startTime = Date.now();
    const db = this.connection.db;

    let preservedAdminDoc: any = null;
    if (preserveCurrentAdmin && adminId && Types.ObjectId.isValid(adminId)) {
      try {
        preservedAdminDoc = await this.userModel.findById(adminId).lean().exec();
      } catch {
        preservedAdminDoc = null;
      }
    }

    const RESTORE_ORDER = [
      'users',
      'system_settings',
      'events',
      'ticket_tiers',
      'seats',
      'coupons',
      'orders',
      'tickets',
      'traffic_logs',
      'audit_logs',
    ];

    let collectionsMap: Record<string, any[]> = {};
    if (data.collections && typeof data.collections === 'object') {
      collectionsMap = data.collections;
    } else if (Array.isArray(data) && dto.collections?.[0]) {
      collectionsMap[dto.collections[0]] = data;
    } else {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          collectionsMap[key] = data[key];
        }
      }
    }

    const restoredReport: Array<{
      name: string;
      label: string;
      insertedCount: number;
      status: 'success' | 'warning' | 'error';
      message?: string;
    }> = [];

    let totalRestoredCount = 0;

    for (const colName of RESTORE_ORDER) {
      if (!targetCollectionNames.includes(colName)) continue;

      const rawDocs = collectionsMap[colName];
      if (!rawDocs || !Array.isArray(rawDocs)) continue;

      const meta = BACKUP_COLLECTIONS_META.find((c) => c.name === colName);
      const label = meta?.label || colName;

      try {
        const normalizedDocs = rawDocs.map((doc) => this.normalizeDocumentValue(doc));

        if (mode === 'clean') {
          await db.collection(colName).deleteMany({});
          if (normalizedDocs.length > 0) {
            const chunkSize = 500;
            for (let i = 0; i < normalizedDocs.length; i += chunkSize) {
              const chunk = normalizedDocs.slice(i, i + chunkSize);
              await db.collection(colName).insertMany(chunk, { ordered: false });
            }
          }
        } else {
          for (const doc of normalizedDocs) {
            if (doc._id) {
              await db.collection(colName).replaceOne({ _id: doc._id }, doc, { upsert: true });
            } else {
              await db.collection(colName).insertOne(doc);
            }
          }
        }

        restoredReport.push({
          name: colName,
          label,
          insertedCount: normalizedDocs.length,
          status: 'success',
        });
        totalRestoredCount += normalizedDocs.length;
      } catch (err: any) {
        restoredReport.push({
          name: colName,
          label,
          insertedCount: 0,
          status: 'error',
          message: err.message || 'Lỗi khi ghi dữ liệu',
        });
      }
    }

    if (preservedAdminDoc && targetCollectionNames.includes('users')) {
      try {
        await db
          .collection('users')
          .replaceOne({ _id: preservedAdminDoc._id }, preservedAdminDoc, { upsert: true });
      } catch (err: any) {
        console.error('Lỗi bảo toàn tài khoản admin:', err.message);
      }
    }

    const durationMs = Date.now() - startTime;

    if (adminId && Types.ObjectId.isValid(adminId)) {
      await this.auditLogModel
        .create({
          userId: new Types.ObjectId(adminId),
          action: 'DATABASE_RESTORE',
          targetCollection: 'database',
          metadata: {
            mode,
            preserveCurrentAdmin,
            restoredCollections: targetCollectionNames,
            totalRestoredCount,
            durationMs,
            report: restoredReport,
          },
        })
        .catch((err) => console.error('Error logging restore audit:', err.message));
    }

    return {
      success: true,
      message: `Khôi phục thành công ${totalRestoredCount} bản ghi trên ${
        restoredReport.filter((r) => r.status === 'success').length
      } collection!`,
      report: {
        mode,
        durationMs,
        totalRestoredCount,
        collections: restoredReport,
      },
    };
  }

  async getBackupHistory(limit = 20) {
    return this.auditLogModel
      .find({ action: { $in: ['DATABASE_BACKUP_EXPORT', 'DATABASE_RESTORE'] } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'fullName email role')
      .exec();
  }

}

