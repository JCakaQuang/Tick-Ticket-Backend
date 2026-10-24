require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { ConflictException, BadRequestException } = require('@nestjs/common');
const { PaymentService } = require('../dist/modules/payment/payment.service');
const { TicketService } = require('../dist/modules/ticket/ticket.service');
const { EventService } = require('../dist/modules/event/event.service');
const {
  EscrowStatus,
  OrderStatus,
  PayoutStatus,
  ReconciliationStatus,
} = require('../dist/schemas/order.schema');

const testSecret = 'a'.repeat(64);
const configMock = {
  getOrThrow: () => testSecret,
  get: () => testSecret,
};

test('UT-01: Cashflow & Escrow breakdown calculates Platform Fee (5%), Gateway Fee (1.5%), and Organizer Net (93.5%)', () => {
  const paymentService = new PaymentService({}, {}, {}, {}, {}, {}, {}, configMock);
  const breakdown = paymentService.calculateCashflowBreakdown(1000000);
  assert.equal(breakdown.platformFeeRate, 0.05);
  assert.equal(breakdown.platformFeeAmount, 50000);
  assert.equal(breakdown.gatewayFeeAmount, 15000);
  assert.equal(breakdown.organizerNetAmount, 935000);
});

test('UT-02: Webhook HMAC-SHA256 verification accepts valid signature and blocks tampered payload or replay attack', () => {
  const paymentService = new PaymentService({}, {}, {}, {}, {}, {}, {}, configMock);
  const orderId = String(new Types.ObjectId());
  const now = Date.now();
  const signature = paymentService.signWebhookPayload({
    orderId,
    providerTransactionId: 'VNP-998877',
    amount: 400000,
    status: 'SUCCESS',
    timestamp: now,
  });

  assert.equal(
    paymentService.verifyWebhookSignature({
      orderId,
      providerTransactionId: 'VNP-998877',
      amount: 400000,
      status: 'SUCCESS',
      timestamp: now,
      signature,
    }),
    true,
  );

  // Tampered amount
  assert.equal(
    paymentService.verifyWebhookSignature({
      orderId,
      providerTransactionId: 'VNP-998877',
      amount: 1000,
      status: 'SUCCESS',
      timestamp: now,
      signature,
    }),
    false,
  );

  // Replay attack (timestamp expired > 5 minutes)
  const expiredTs = now - 6 * 60 * 1000;
  const expiredSig = paymentService.signWebhookPayload({
    orderId,
    providerTransactionId: 'VNP-998877',
    amount: 400000,
    status: 'SUCCESS',
    timestamp: expiredTs,
  });
  assert.equal(
    paymentService.verifyWebhookSignature({
      orderId,
      providerTransactionId: 'VNP-998877',
      amount: 400000,
      status: 'SUCCESS',
      timestamp: expiredTs,
      signature: expiredSig,
    }),
    false,
  );
});

test('UT-03: Idempotency Key prevents duplicate payment execution and blocks cross-order key collision (409)', async () => {
  const paymentService = new PaymentService({}, {}, {}, {}, {}, {}, {}, configMock);
  const userId = String(new Types.ObjectId());
  const orderId1 = String(new Types.ObjectId());
  const orderId2 = String(new Types.ObjectId());
  let txCount = 0;

  paymentService.executePaymentTransaction = async () => {
    txCount += 1;
    return {
      success: true,
      order: {
        _id: orderId1,
        orderCode: 'ORD-IDEM-1',
        userId,
        totalAmount: 200000,
        status: OrderStatus.PAID,
        escrowStatus: EscrowStatus.HELD,
        reconciliationStatus: ReconciliationStatus.UNRECONCILED,
        payoutStatus: PayoutStatus.NONE,
      },
      tickets: [{ _id: new Types.ObjectId() }],
    };
  };

  const first = await paymentService.processPayment(
    { orderId: orderId1, paymentMethod: 'VNPAY' },
    userId,
    'idem-key-001',
  );
  assert.equal(first.success, true);
  assert.equal(txCount, 1);

  const second = await paymentService.processPayment(
    { orderId: orderId1, paymentMethod: 'VNPAY' },
    userId,
    'idem-key-001',
  );
  assert.equal(second.idempotentReplay, true);
  assert.equal(txCount, 1);

  await assert.rejects(
    () =>
      paymentService.processPayment(
        { orderId: orderId2, paymentMethod: 'VNPAY' },
        userId,
        'idem-key-001',
      ),
    ConflictException,
  );
});

test('UT-04: QR E-Ticket HMAC-SHA256 signing and constant-time anti-counterfeit verification', () => {
  const paymentService = new PaymentService({}, {}, {}, {}, {}, {}, {}, configMock);
  const ticketService = new TicketService({}, {}, {}, configMock);

  const tId = String(new Types.ObjectId());
  const eId = String(new Types.ObjectId());
  const uId = String(new Types.ObjectId());
  const ts = Date.now();

  const qrToken = paymentService.generateQrToken(tId, eId, uId, ts);
  const verified = ticketService.verifyQrToken(qrToken);
  assert.deepEqual(verified, {
    ticketId: tId,
    eventId: eId,
    userId: uId,
    timestamp: ts,
  });

  const decoded = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf8'));
  decoded.sig = '0'.repeat(32);
  const forgedToken = Buffer.from(JSON.stringify(decoded)).toString('base64');
  assert.throws(() => ticketService.verifyQrToken(forgedToken), BadRequestException);
});

test('UT-05: Recommendation Rule Engine (Multi-Stage Constraint Relaxation) & BCX 5-Step Funnel', async () => {
  const now = Date.now();
  const ev1Id = new Types.ObjectId();
  const ev2Id = new Types.ObjectId();

  const mockEventModel = {
    find: () => ({
      sort: () => ({
        limit: () => ({
          lean: () => ({
            exec: async () => [
              {
                _id: ev1Id,
                title: 'Indie Night HCMC',
                category: 'other',
                location: { city: 'TP.HCM' },
                isTrending: false,
                startTime: new Date(now + 86400000),
              },
              {
                _id: ev2Id,
                title: 'Rock Symphony Ha Noi',
                category: 'music',
                location: { city: 'Ha Noi' },
                isTrending: true,
                startTime: new Date(now + 86400000),
              },
            ],
          }),
        }),
      }),
    }),
  };

  const mockTierModel = {
    find: () => ({
      lean: () => ({
        exec: async () => [
          { eventId: ev1Id, price: 800000 },
          { eventId: ev2Id, price: 200000 },
        ],
      }),
    }),
  };

  const eventService = new EventService(mockEventModel, mockTierModel, {}, {});
  const recResult = await eventService.getRecommendations({
    category: 'music',
    city: 'Ha Noi',
    maxPrice: 250000,
    limit: 5,
  });

  assert.equal(recResult.strategy, 'MULTI_STAGE_CONSTRAINT_RELAXATION');
  assert.equal(recResult.recommendations[0].title, 'Rock Symphony Ha Noi');
  assert(
    recResult.recommendations[0].recommendationScore >
      recResult.recommendations[1].recommendationScore,
  );
  assert(recResult.recommendations[0].recommendationReasons.includes('Cùng thể loại'));

  eventService.trackFunnelStep({ step: 'VIEW_EVENT' });
  eventService.trackFunnelStep({ step: 'VIEW_EVENT' });
  eventService.trackFunnelStep({ step: 'SELECT_TICKET' });
  eventService.trackFunnelStep({ step: 'UPSELL_ADDON' });
  eventService.trackFunnelStep({ step: 'CHECKOUT_INITIATED' });
  eventService.trackFunnelStep({ step: 'PAYMENT_SUCCESS' });

  const funnel = eventService.getFunnelAnalytics();
  assert.equal(funnel.steps.VIEW_EVENT, 2);
  assert.equal(funnel.steps.PAYMENT_SUCCESS, 1);
  assert.equal(funnel.conversionRates.overallConversionRate, 50);
});

test('UT-06: Public Ticket Share strips qrToken (qrProtected=true) and generates shareVerificationHash', async () => {
  const ticketId = new Types.ObjectId();
  const queryChain = {
    populate: () => queryChain,
    lean: () => ({
      exec: async () => ({
        _id: ticketId,
        status: 'valid',
        qrToken: 'SECRET_QR_TOKEN_NEVER_EXPOSE',
        eventId: {
          title: 'Live Concert 2026',
          slug: 'live-concert-2026',
          startTime: new Date(),
          location: { city: 'Ha Noi', address: 'My Dinh' },
        },
        tierId: { name: 'VIP', price: 1500000 },
        seatId: { seatNumber: 'A1', zone: 'VIP-A' },
        userId: { fullName: 'Nguyen Van A', email: 'a@example.com' },
      }),
    }),
  };
  const mockTicketModel = {
    findById: () => queryChain,
  };

  const ticketService = new TicketService(mockTicketModel, {}, {}, configMock);
  const shared = await ticketService.getPublicShareTicket(String(ticketId));

  assert.equal(shared.qrProtected, true);
  assert.equal(shared.qrToken, undefined);
  assert.equal(typeof shared.shareVerificationHash, 'string');
  assert.equal(shared.shareVerificationHash.length, 16);
  assert.equal(shared.maskedOwner, 'Ngu***A');
});
test('UT-07: TrafficService records real visitor pings with IP sanitization and flags sample data correctly', async () => {
  const { TrafficService, KNOWN_SAMPLE_IPS } = require('../dist/modules/traffic/traffic.service');
  const recordedLogs = [];
  const mockTrafficLogModel = {
    create: async (doc) => {
      recordedLogs.push(doc);
      return { _id: new Types.ObjectId(), ...doc };
    },
    countDocuments: async () => recordedLogs.length,
    distinct: async () => ['127.0.0.1'],
    aggregate: async () => [],
    find: () => ({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: () => ({
              exec: async () => recordedLogs,
            }),
          }),
        }),
      }),
    }),
    updateMany: async () => ({ modifiedCount: 0 }),
    deleteMany: async () => ({ deletedCount: 0 }),
  };

  const trafficService = new TrafficService(mockTrafficLogModel);

  // 1. Record live visit
  const liveLog = await trafficService.recordTraffic({
    path: '/events/anh-trai-say-hi-live-concert-2026',
    ipAddress: '::ffff:127.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
    isSample: false,
  });

  assert.equal(liveLog.path, '/events/anh-trai-say-hi-live-concert-2026');
  assert.equal(liveLog.ipAddress, '127.0.0.1');
  assert.equal(liveLog.browser, 'Chrome');
  assert.equal(liveLog.deviceType, 'desktop');
  assert.equal(liveLog.isSample, false);

  // 2. Record mobile sample visit
  const sampleLog = await trafficService.recordTraffic({
    path: '/checkout/order-123',
    ipAddress: KNOWN_SAMPLE_IPS[0],
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1',
    isSample: true,
  });

  assert.equal(sampleLog.isSample, true);
  assert.equal(sampleLog.deviceType, 'mobile');
  assert.equal(sampleLog.browser, 'Safari');
});


