import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env files
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserSchema, UserRole } from './schemas/user.schema';
import { Event, EventSchema, EventStatus, EventType } from './schemas/event.schema';
import { TicketTier, TicketTierSchema, TierType } from './schemas/ticket-tier.schema';
import { Seat, SeatSchema, SeatStatus } from './schemas/seat.schema';
import { Coupon, CouponSchema, DiscountType } from './schemas/coupon.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { Ticket, TicketSchema } from './schemas/ticket.schema';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI must be configured before seeding');

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'ticketbox',
  });
  console.log('Connected to MongoDB successfully.');

  const UserModel = mongoose.model(User.name, UserSchema);
  const EventModel = mongoose.model(Event.name, EventSchema);
  const TicketTierModel = mongoose.model(TicketTier.name, TicketTierSchema);
  const SeatModel = mongoose.model(Seat.name, SeatSchema);
  const CouponModel = mongoose.model(Coupon.name, CouponSchema);
  const OrderModel = mongoose.model(Order.name, OrderSchema);
  const TicketModel = mongoose.model(Ticket.name, TicketSchema);

  // Clear existing collections
  console.log('Clearing existing data...');
  await Promise.all([
    UserModel.deleteMany({}),
    EventModel.deleteMany({}),
    TicketTierModel.deleteMany({}),
    SeatModel.deleteMany({}),
    CouponModel.deleteMany({}),
    OrderModel.deleteMany({}),
    TicketModel.deleteMany({}),
  ]);
  const createSeatsForTier = async (
    eventId: any,
    tierId: any,
    rows: string[],
    colsCount: number,
    zone = 'Standard',
  ) => {
    const list = [];
    for (const r of rows) {
      for (let c = 1; c <= colsCount; c++) {
        list.push({
          eventId,
          tierId,
          seatCode: `${r}-${c.toString().padStart(2, '0')}`,
          row: r,
          col: c,
          zone,
          status: SeatStatus.AVAILABLE,
        });
      }
    }
    await SeatModel.insertMany(list);
  };


  // 1. Create Users
  console.log('Seeding users...');
  const passwordHash = await bcrypt.hash('password123', 10);
  const secretPasswordHash = await bcrypt.hash('Secret123!', 10);

  const adminUser = await UserModel.create({
    email: 'admin@ticketbox.vn',
    passwordHash,
    fullName: 'Ticketbox Admin',
    role: UserRole.ADMIN,
    phoneNumber: '0901234567',
  });

  const organizerUser = await UserModel.create({
    email: 'organizer@ticketbox.vn',
    passwordHash: secretPasswordHash,
    fullName: 'VieNetwork Entertainment',
    role: UserRole.ORGANIZER,
    phoneNumber: '0912345678',
  });

  const customerUser = await UserModel.create({
    email: 'user@ticketbox.vn',
    passwordHash,
    fullName: 'Nguyen Van A',
    role: UserRole.USER,
    phoneNumber: '0987654321',
  });

  const demoCustomerUser = await UserModel.create({
    email: 'demo.customer@ticketbox.vn',
    passwordHash: secretPasswordHash,
    fullName: 'Demo Customer',
    role: UserRole.USER,
    phoneNumber: '0987654322',
  });

  // 2. Create Event 1: Seated Concert (Anh Trai Say Hi)
  console.log('Seeding Event 1 (Seated)...');
  const event1 = await EventModel.create({
    title: 'Anh Trai "Say Hi" - Live Concert 2026',
    slug: 'anh-trai-say-hi-live-concert-2026',
    description:
      'Đại nhạc hội bùng nổ nhất năm quy tụ 30 anh trai cùng những bản hit triệu view với hệ thống âm thanh, ánh sáng chuẩn quốc tế tại SVĐ Mỹ Đình!',
    bannerUrl: '/events/trending-1.webp',
    posterUrl: '/events/special-3.webp',
    isSpecial: true,
    specialBadge: 'Live Concert',
    specialOrder: 1,
    isTrending: true,
    trendingRank: 1,
    location: {
      name: 'Sân vận động Quốc gia Mỹ Đình',
      address: 'Đường Lê Đức Thọ, Mỹ Đình, Nam Từ Liêm',
      city: 'Hà Nội',
      coordinates: { lat: 21.0205, lng: 105.7645 },
    },
    type: EventType.SEATED,
    category: 'CONCERT',
    startTime: new Date('2026-11-20T19:00:00+07:00'),
    endTime: new Date('2026-11-20T23:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_ANHTRAISAYHI',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*ANHTRAISAYHI*2026',
    vnpayAccountName: 'BAN TO CHUC ANH TRAI SAY HI',
    vnpayBankName: 'VNPAY - Vietcombank',
  });

  // Ticket Tiers for Event 1
  const tierVvip = await TicketTierModel.create({
    eventId: event1._id,
    name: 'VVIP - Sát Sân Khấu',
    description: 'Bao gồm quà tặng độc quyền, photocard chữ ký và lối vào riêng',
    price: 2500000,
    totalQuantity: 20,
    availableQuantity: 20,
    reservedQuantity: 0,
    soldQuantity: 0,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  const tierVip = await TicketTierModel.create({
    eventId: event1._id,
    name: 'VIP Khán Đài A',
    description: 'Tầm nhìn trực diện trung tâm sân khấu, ghế tựa êm ái',
    price: 1800000,
    totalQuantity: 20,
    availableQuantity: 20,
    reservedQuantity: 0,
    soldQuantity: 0,
    type: TierType.SEATED,
    maxPerUser: 5,
  });

  const tierStandard = await TicketTierModel.create({
    eventId: event1._id,
    name: 'Standard Khán Đài B',
    description: 'Tầm nhìn bao quát toàn bộ hiệu ứng ánh sáng đại nhạc hội',
    price: 900000,
    totalQuantity: 20,
    availableQuantity: 20,
    reservedQuantity: 0,
    soldQuantity: 0,
    type: TierType.SEATED,
    maxPerUser: 5,
  });

  // Create Seats for Event 1 (60 seats total)
  console.log('Seeding seats for Event 1...');
  const seats = [];

  // VVIP: Rows A and B (20 seats)
  for (const row of ['A', 'B']) {
    for (let num = 1; num <= 10; num++) {
      seats.push({
        eventId: event1._id,
        tierId: tierVvip._id,
        seatCode: `${row}${num.toString().padStart(2, '0')}`,
        row,
        col: num,
        zone: 'VVIP',
        status: SeatStatus.AVAILABLE,
      });
    }
  }

  // VIP: Rows C and D (20 seats)
  for (const row of ['C', 'D']) {
    for (let num = 1; num <= 10; num++) {
      seats.push({
        eventId: event1._id,
        tierId: tierVip._id,
        seatCode: `${row}${num.toString().padStart(2, '0')}`,
        row,
        col: num,
        zone: 'VIP',
        status: SeatStatus.AVAILABLE,
      });
    }
  }

  // Standard: Rows E and F (20 seats)
  for (const row of ['E', 'F']) {
    for (let num = 1; num <= 10; num++) {
      seats.push({
        eventId: event1._id,
        tierId: tierStandard._id,
        seatCode: `${row}${num.toString().padStart(2, '0')}`,
        row,
        col: num,
        zone: 'Standard',
        status: SeatStatus.AVAILABLE,
      });
    }
  }
  await SeatModel.insertMany(seats);

  // 3. Create Event 2: General Admission (Monsoon Music Festival)
  console.log('Seeding Event 2 (GA)...');
  const event2 = await EventModel.create({
    title: 'Monsoon Music Festival 2026 - Gió Mùa Trở Lại',
    slug: 'monsoon-music-festival-2026',
    description:
      'Lễ hội âm nhạc quốc tế Gió Mùa trở lại không gian di sản Hoàng Thành Thăng Long với sự góp mặt của các nghệ sĩ Indie và quốc tế hàng đầu.',
    bannerUrl: '/events/trending-3.webp',
    posterUrl: '/events/special-4.webp',
    isSpecial: true,
    specialBadge: 'Festival Âm Nhạc',
    specialOrder: 3,
    isTrending: true,
    trendingRank: 3,
    location: {
      name: 'Hoàng Thành Thăng Long',
      address: '19C Hoàng Diệu, Điện Bàn, Ba Đình',
      city: 'Hà Nội',
      coordinates: { lat: 21.0345, lng: 105.8405 },
    },
    type: EventType.GA,
    category: 'CONCERT',
    startTime: new Date('2026-10-15T16:00:00+07:00'),
    endTime: new Date('2026-10-17T23:00:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_MONSOON2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*MONSOONFESTIVAL*2026',
    vnpayAccountName: 'MONSOON MUSIC FESTIVAL',
    vnpayBankName: 'VNPAY - MBBank',
  });

  await TicketTierModel.create([
    {
      eventId: event2._id,
      name: 'Early Bird - Vé Phổ Thông Đứng',
      description: 'Vé vào cửa 1 ngày tự do khu vực fanzone bãi cỏ',
      price: 450000,
      totalQuantity: 500,
      availableQuantity: 500,
      type: TierType.GA,
      maxPerUser: 5,
    },
    {
      eventId: event2._id,
      name: 'Standard GA - Vé Tiêu Chuẩn',
      description: 'Vé vào cổng tự do kèm voucher đồ uống',
      price: 650000,
      totalQuantity: 1000,
      availableQuantity: 1000,
      reservedQuantity: 0,
      soldQuantity: 0,
      type: TierType.GA,
      maxPerUser: 5,
    },
    {
      eventId: event2._id,
      name: 'VIP Standing Lounge',
      description: 'Khu vực bục cao sát sân khấu, quầy bar riêng miễn phí bia và canape',
      price: 1350000,
      totalQuantity: 200,
      availableQuantity: 200,
      reservedQuantity: 0,
      soldQuantity: 0,
      type: TierType.GA,
      maxPerUser: 4,
    },
  ]);

  // 4. Create Event 3: Chillies Concert (Hybrid)
  console.log('Seeding Event 3 (Hybrid)...');
  const event3 = await EventModel.create({
    title: 'Chillies - Concert Tour: "Trên Những Đám Mây"',
    slug: 'chillies-tren-nhung-dam-may-tour',
    description:
      'Hòa mình vào không gian âm nhạc đầy cảm xúc của Chillies với những bản tình ca Mascara, Vùng Ký Ức, Giá Như và những sáng tác mới nhất.',
    bannerUrl: '/events/trending-4.webp',
    posterUrl: '/events/special-5.webp',
    isSpecial: true,
    specialBadge: 'Concert Tour',
    specialOrder: 4,
    isTrending: true,
    trendingRank: 4,
    location: {
      name: 'Nhà Thi Đấu Quân Khu 7',
      address: '202 Hoàng Văn Thụ, Phường 9, Phú Nhuận',
      city: 'TP. Hồ Chí Minh',
      coordinates: { lat: 10.7995, lng: 106.6714 },
    },
    type: EventType.HYBRID,
    category: 'THEATER',
    startTime: new Date('2026-12-05T19:30:00+07:00'),
    endTime: new Date('2026-12-05T22:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_CHILLIESTOUR',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*CHILLIESTOUR*2026',
    vnpayAccountName: 'CHILLIES CONCERT TOUR',
    vnpayBankName: 'VNPAY - Techcombank',
  });

  const tierChilliesGA = await TicketTierModel.create({
    eventId: event3._id,
    name: 'GA Fanzone Đứng (Sát Sân Khấu)',
    description: 'Cháy hết mình cùng ban nhạc ở cự ly gần nhất',
    price: 750000,
    totalQuantity: 300,
    availableQuantity: 300,
    reservedQuantity: 0,
    soldQuantity: 0,
    type: TierType.GA,
    maxPerUser: 5,
  });

  const tierChilliesTribune = await TicketTierModel.create({
    eventId: event3._id,
    name: 'Khán Đài Ngồi VIP',
    description: 'Ghế ngồi trung tâm tầng 1, thưởng thức âm nhạc thư thái',
    price: 950000,
    totalQuantity: 20,
    availableQuantity: 20,
    reservedQuantity: 0,
    soldQuantity: 0,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  // Seats for Chillies VIP Tribune
  const chilliesSeats = [];
  for (const row of ['A', 'B']) {
    for (let num = 1; num <= 10; num++) {
      chilliesSeats.push({
        eventId: event3._id,
        tierId: tierChilliesTribune._id,
        seatCode: `VIP-${row}${num.toString().padStart(2, '0')}`,
        row,
        col: num,
        zone: 'VIP Tribune',
        status: SeatStatus.AVAILABLE,
      });
    }
  }
  await SeatModel.insertMany(chilliesSeats);

  // 5. Create Event 4: The Phantom Theater (Seated)
  console.log('Seeding Event 4 (Theater - Seated)...');
  const event4 = await EventModel.create({
    title: 'Vở Nhạc Kịch "Bóng Ma Trong Nhà Hát" 2026',
    slug: 'bong-ma-trong-nha-hat-2026',
    description: 'Kiệt tác nhạc kịch kinh điển thế giới với dàn diễn viên quốc tế và dàn nhạc giao hưởng thính phòng trực tiếp tại Nhà Hát Lớn.',
    bannerUrl: '/events/trending-2.webp',
    posterUrl: '/events/special-2.webp',
    isSpecial: true,
    specialBadge: 'Nhạc Kịch Quốc Tế',
    specialOrder: 2,
    isTrending: true,
    trendingRank: 5,
    location: {
      name: 'Nhà Hát Lớn Hà Nội',
      address: '01 Tràng Tiền, Hoàn Kiếm',
      city: 'Hà Nội',
      coordinates: { lat: 21.0245, lng: 105.8576 },
    },
    type: EventType.SEATED,
    category: 'THEATER',
    startTime: new Date('2026-10-25T19:30:00+07:00'),
    endTime: new Date('2026-10-25T22:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_PHANTOM2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*PHANTOM*2026',
    vnpayAccountName: 'NHA HAT LON HA NOI',
    vnpayBankName: 'VNPAY - BIDV',
  });

  const tierPhantomVip = await TicketTierModel.create({
    eventId: event4._id,
    name: 'Khán Phòng Hoàng Gia VIP',
    description: 'Vị trí tầng lửng trung tâm, góc nhìn sân khấu hoàn mỹ nhất',
    price: 850000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  const tierPhantomStandard = await TicketTierModel.create({
    eventId: event4._id,
    name: 'Ghế Thính Phòng Tiêu Chuẩn',
    description: 'Thưởng thức trọn vẹn âm vang thính phòng',
    price: 450000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  await createSeatsForTier(event4._id, tierPhantomVip._id, ['A', 'B'], 8, 'Royal VIP');
  await createSeatsForTier(event4._id, tierPhantomStandard._id, ['C', 'D'], 8, 'Auditorium');

  // 6. Create Event 5: Basketball Tournament (Seated)
  console.log('Seeding Event 5 (Sports - Seated)...');
  const event5 = await EventModel.create({
    title: 'Giải Vô Địch Bóng Rổ Chuyên Nghiệp VBA Final 2026',
    slug: 'vba-finals-2026-championship',
    description: 'Trận chung kết nảy lửa tranh cúp vô địch bóng rổ chuyên nghiệp Việt Nam với các pha dunk rực lửa và ngôi sao giải đấu.',
    bannerUrl: '/events/basketball.jpg',
    location: {
      name: 'Nhà Thi Đấu Hồ Xuân Hương',
      address: '02 Hồ Xuân Hương, Phường 6, Quận 3',
      city: 'TP. Hồ Chí Minh',
      coordinates: { lat: 10.7765, lng: 106.6905 },
    },
    type: EventType.SEATED,
    category: 'SPORTS',
    startTime: new Date('2026-11-08T18:00:00+07:00'),
    endTime: new Date('2026-11-08T21:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_VBA2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*VBAFINAL*2026',
    vnpayAccountName: 'VBA BASKETBALL VIETNAM',
    vnpayBankName: 'VNPAY - ACB',
  });

  const tierCourtside = await TicketTierModel.create({
    eventId: event5._id,
    name: 'Ghế Courtside Sát Sàn Đấu',
    description: 'Cảm nhận từng bước chạy và va chạm của các vận động viên',
    price: 1200000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  const tierTribuneSports = await TicketTierModel.create({
    eventId: event5._id,
    name: 'Khán Đài A Trung Tâm',
    description: 'Góc nhìn toàn cảnh sàn đấu sôi động',
    price: 350000,
    totalQuantity: 20,
    availableQuantity: 20,
    type: TierType.SEATED,
    maxPerUser: 5,
  });

  await createSeatsForTier(event5._id, tierCourtside._id, ['CS1', 'CS2'], 8, 'Courtside');
  await createSeatsForTier(event5._id, tierTribuneSports._id, ['T1', 'T2'], 10, 'Tribune A');

  // 7. Create Event 6: Vietnam Tech & AI Summit (GA)
  console.log('Seeding Event 6 (Seminar - GA)...');
  const event6 = await EventModel.create({
    title: 'Diễn Đàn Công Nghệ Quốc Tế AI & Tech Summit Vietnam 2026',
    slug: 'vietnam-tech-ai-summit-2026',
    description: 'Hội tụ 50+ diễn giả công nghệ hàng đầu thế giới chia sẻ về GenAI, Điện toán đám mây và Đột phá Khởi nghiệp.',
    bannerUrl: '/events/tech-summit.jpg',
    location: {
      name: 'Trung Tâm Triển Lãm & Hội Nghị SECC',
      address: '799 Nguyễn Văn Linh, Tân Phú, Quận 7',
      city: 'TP. Hồ Chí Minh',
      coordinates: { lat: 10.7295, lng: 106.7214 },
    },
    type: EventType.GA,
    category: 'SEMINAR',
    startTime: new Date('2026-11-12T08:30:00+07:00'),
    endTime: new Date('2026-11-12T17:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_TECHAISUMMIT',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*TECHAISUMMIT*2026',
    vnpayAccountName: 'VIETNAM TECH SUMMIT',
    vnpayBankName: 'VNPAY - Vietcombank',
  });

  await TicketTierModel.create([
    {
      eventId: event6._id,
      name: 'Standard Delegate Pass',
      description: 'Tham dự trọn gói các phiên thảo luận và khu vực triển lãm Tech Expo',
      price: 590000,
      totalQuantity: 400,
      availableQuantity: 400,
      type: TierType.GA,
      maxPerUser: 5,
    },
    {
      eventId: event6._id,
      name: 'VIP Executive & Dinner Pass',
      description: 'Bao gồm vé VIP hàng đầu, tiệc tối Networking cùng diễn giả và nhà đầu tư',
      price: 1850000,
      totalQuantity: 80,
      availableQuantity: 80,
      type: TierType.GA,
      maxPerUser: 3,
    },
  ]);

  // 8. Create Event 7: Vu Concert (Seated)
  console.log('Seeding Event 7 (Concert - Seated)...');
  const event7 = await EventModel.create({
    title: 'Vũ. - Concert Tour: "Bảo Tàng Của Nuối Tiếc"',
    slug: 'vu-bao-tang-cua-nuoi-tiec-tour',
    description: 'Đêm nhạc trữ tình đậm chất tự sự của "Hoàng tử Indie" Vũ cùng những ca khúc chạm đến trái tim người nghe.',
    bannerUrl: '/events/trending-2.webp',
    posterUrl: '/events/special-2.webp',
    isSpecial: true,
    specialBadge: 'Indie Pop',
    specialOrder: 2,
    isTrending: true,
    trendingRank: 2,
    location: {
      name: 'Nhà Hát Trưng Vương Đà Nẵng',
      address: '86 Hùng Vương, Hải Châu 1, Hải Châu',
      city: 'Đà Nẵng',
      coordinates: { lat: 16.0695, lng: 108.2214 },
    },
    type: EventType.SEATED,
    category: 'CONCERT',
    startTime: new Date('2026-11-28T19:30:00+07:00'),
    endTime: new Date('2026-11-28T22:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_VUTOUR2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*VUTOUR*2026',
    vnpayAccountName: 'VU CONCERT TOUR',
    vnpayBankName: 'VNPAY - TPBank',
  });

  const tierVuVip = await TicketTierModel.create({
    eventId: event7._id,
    name: 'Khán Đài VIP Trung Tâm',
    description: 'Ghế ngồi chính diện sân khấu acoustic ấm cúng',
    price: 900000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  const tierVuStandard = await TicketTierModel.create({
    eventId: event7._id,
    name: 'Khán Đài Tiêu Chuẩn',
    description: 'Thưởng thức không gian âm nhạc indie mộc mạc',
    price: 450000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  await createSeatsForTier(event7._id, tierVuVip._id, ['A', 'B'], 8, 'VIP Center');
  await createSeatsForTier(event7._id, tierVuStandard._id, ['C', 'D'], 8, 'Standard');

  // 9. Create Event 8: Marathon Marvelous (GA)
  console.log('Seeding Event 8 (Sports - GA)...');
  const event8 = await EventModel.create({
    title: 'Giải Chạy VnExpress Marathon Marvelous Đà Nẵng 2026',
    slug: 'vnexpress-marathon-marvelous-da-nang-2026',
    description: 'Cung đường chạy ven biển tuyệt đẹp đón bình minh trên bãi biển Mỹ Khê và cầu Rồng huyền thoại.',
    bannerUrl: '/events/marathon.jpg',
    location: {
      name: 'Công Viên Biển Đông',
      address: 'Đường Võ Nguyên Giáp, Phước Mỹ, Sơn Trà',
      city: 'Đà Nẵng',
      coordinates: { lat: 16.0655, lng: 108.2455 },
    },
    type: EventType.GA,
    category: 'SPORTS',
    startTime: new Date('2026-12-10T04:00:00+07:00'),
    endTime: new Date('2026-12-10T11:00:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_MARATHON2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*MARATHON*2026',
    vnpayAccountName: 'VNEXPRESS MARATHON',
    vnpayBankName: 'VNPAY - Vietinbank',
  });

  await TicketTierModel.create([
    {
      eventId: event8._id,
      name: 'BIB Cự Ly Bán Marathon 21KM',
      description: 'Bao gồm áo finisher, huy chương kỷ niệm và gói hỗ trợ điện giải',
      price: 650000,
      totalQuantity: 500,
      availableQuantity: 500,
      type: TierType.GA,
      maxPerUser: 5,
    },
    {
      eventId: event8._id,
      name: 'BIB Full Marathon 42KM Đỉnh Cao',
      description: 'Chinh phục cự ly full marathon chuyên nghiệp ven biển',
      price: 950000,
      totalQuantity: 300,
      availableQuantity: 300,
      type: TierType.GA,
      maxPerUser: 5,
    },
  ]);

  // 10. Create Event 9: Kịch Nói IDECAF (Seated)
  console.log('Seeding Event 9 (Theater - Seated)...');
  const event9 = await EventModel.create({
    title: 'Kịch Nói Kinh Điển: "Hồn Trương Ba, Da Hàng Thịt"',
    slug: 'hon-truong-ba-da-hang-thit-idecaf-2026',
    description: 'Vở kịch bất hủ của tác giả Lưu Quang Vũ được tái hiện sống động với dàn nghệ sĩ gạo cội sân khấu IDECAF.',
    bannerUrl: '/events/special-1.webp',
    posterUrl: '/events/special-1.webp',
    isSpecial: true,
    specialBadge: 'Sân Khấu Kịch',
    specialOrder: 5,
    isTrending: true,
    trendingRank: 6,
    location: {
      name: 'Sân Khấu Kịch IDECAF',
      address: '28 Lê Thánh Tôn, Bến Nghé, Quận 1',
      city: 'TP. Hồ Chí Minh',
      coordinates: { lat: 10.7785, lng: 106.7025 },
    },
    type: EventType.SEATED,
    category: 'THEATER',
    startTime: new Date('2026-12-18T20:00:00+07:00'),
    endTime: new Date('2026-12-18T22:30:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_IDECAF2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*IDECAF*2026',
    vnpayAccountName: 'SAN KHAU KICH IDECAF',
    vnpayBankName: 'VNPAY - Sacombank',
  });

  const tierIdecafVip = await TicketTierModel.create({
    eventId: event9._id,
    name: 'Ghế VIP Hàng Đầu (Gần Diễn Viên)',
    description: 'Cảm nhận từng biểu cảm và giọng thoại truyền cảm nhất',
    price: 450000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  const tierIdecafStandard = await TicketTierModel.create({
    eventId: event9._id,
    name: 'Ghế Khán Phòng Tiêu Chuẩn',
    description: 'Vị trí xem kịch thoải mái tầng trung tâm',
    price: 280000,
    totalQuantity: 16,
    availableQuantity: 16,
    type: TierType.SEATED,
    maxPerUser: 4,
  });

  await createSeatsForTier(event9._id, tierIdecafVip._id, ['A', 'B'], 8, 'VIP First Row');
  await createSeatsForTier(event9._id, tierIdecafStandard._id, ['C', 'D'], 8, 'Auditorium');

  // 11. Create Event 10: Diễn Đàn Khởi Nghiệp Quốc Tế (GA)
  console.log('Seeding Event 10 (Seminar - GA)...');
  const event10 = await EventModel.create({
    title: 'Diễn Đàn Đổi Mới Sáng Tạo & Khởi Nghiệp Quốc Tế 2026',
    slug: 'vietnam-startup-innovation-forum-2026',
    description: 'Cơ hội kết nối 200+ quỹ đầu tư mạo hiểm và các startup kỳ lân công nghệ hàng đầu Đông Nam Á.',
    bannerUrl: '/events/startup-forum.jpg',
    location: {
      name: 'Trung Tâm Hội Nghị Quốc Gia NCC',
      address: 'Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm',
      city: 'Hà Nội',
      coordinates: { lat: 21.0065, lng: 105.7835 },
    },
    type: EventType.GA,
    category: 'SEMINAR',
    startTime: new Date('2026-12-22T08:00:00+07:00'),
    endTime: new Date('2026-12-22T17:00:00+07:00'),
    organizerId: organizerUser._id,
    status: EventStatus.PUBLISHED,
    vnpayTmnCode: 'VNPAY_STARTUP2026',
    vnpayQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=VNPAYQR*STARTUP*2026',
    vnpayAccountName: 'VIETNAM INNOVATION FORUM',
    vnpayBankName: 'VNPAY - Techcombank',
  });

  await TicketTierModel.create([
    {
      eventId: event10._id,
      name: 'General Pass - Vé Khách Tham Dự',
      description: 'Tham gia các phiên pitching, triển lãm gian hàng startup',
      price: 350000,
      totalQuantity: 300,
      availableQuantity: 300,
      type: TierType.GA,
      maxPerUser: 5,
    },
    {
      eventId: event10._id,
      name: 'Investor Pass VIP & B2B Matchmaking',
      description: 'Tham gia phòng họp riêng 1-on-1 với founder và bữa trưa đối tác cao cấp',
      price: 1500000,
      totalQuantity: 50,
      availableQuantity: 50,
      type: TierType.GA,
      maxPerUser: 2,
    },
  ]);

  // 5. Create Coupons
  console.log('Seeding coupons...');
  await CouponModel.create([
    {
      code: 'WELCOME2026',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10, // 10%
      maxDiscountAmount: 100000, // Max 100k
      minOrderValue: 300000,
      usageLimit: 1000,
      usedCount: 0,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
      isActive: true,
    },
    {
      code: 'TICKETBOX50K',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 50000, // 50,000 VND
      minOrderValue: 500000,
      usageLimit: 500,
      usedCount: 0,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
      isActive: true,
    },
  ]);

  console.log('Database seeded successfully!');
  console.log('Sample Accounts:');
  console.log(' - Admin: admin@ticketbox.vn / password123');
  console.log(' - Organizer: organizer@ticketbox.vn / Secret123!');
  console.log(' - Customer: user@ticketbox.vn / password123');
  console.log(' - Demo customer: demo.customer@ticketbox.vn / Secret123!');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
