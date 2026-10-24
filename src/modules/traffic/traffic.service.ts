import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TrafficLog, TrafficLogDocument } from '../../schemas/traffic-log.schema';

export const KNOWN_SAMPLE_IPS = [
  '14.162.140.23',
  '118.69.182.10',
  '113.161.72.55',
  '171.244.38.12',
  '27.72.105.88',
  '42.112.90.15',
];

@Injectable()
export class TrafficService implements OnModuleInit {
  private readonly logger = new Logger(TrafficService.name);

  constructor(
    @InjectModel(TrafficLog.name) private trafficLogModel: Model<TrafficLogDocument>,
  ) {}

  async onModuleInit() {
    try {
      await this.trafficLogModel.updateMany(
        {
          ipAddress: { $in: KNOWN_SAMPLE_IPS },
          isSample: { $ne: true },
        },
        { $set: { isSample: true } },
      );
      await this.seedSampleTrafficIfEmpty();
    } catch (err: any) {
      this.logger.warn(`TrafficService init note: ${err.message}`);
    }
  }

  private parseUserAgent(ua: string = '') {
    const lower = ua.toLowerCase();
    let deviceType = 'desktop';
    if (/mobile|iphone|ipod|android.*mobile/.test(lower)) {
      deviceType = 'mobile';
    } else if (/ipad|tablet|android(?!.*mobile)/.test(lower)) {
      deviceType = 'tablet';
    }

    let browser = 'Khác';
    if (lower.includes('edg/')) {
      browser = 'Edge';
    } else if (lower.includes('opr/') || lower.includes('opera/')) {
      browser = 'Opera';
    } else if (lower.includes('chrome/')) {
      browser = 'Chrome';
    } else if (lower.includes('firefox/')) {
      browser = 'Firefox';
    } else if (lower.includes('safari/')) {
      browser = 'Safari';
    }

    return { deviceType, browser };
  }

  async recordTraffic(data: {
    path: string;
    referrer?: string;
    ipAddress?: string;
    userAgent?: string;
    userId?: string;
    isSample?: boolean;
  }) {
    try {
      const { deviceType, browser } = this.parseUserAgent(data.userAgent);
      let cleanIp = (data.ipAddress || '127.0.0.1').trim();
      if (cleanIp === '::1' || cleanIp === '1' || cleanIp === '::ffff:127.0.0.1') {
        cleanIp = '127.0.0.1';
      } else if (cleanIp.startsWith('::ffff:')) {
        cleanIp = cleanIp.replace('::ffff:', '');
      }

      const isSample = Boolean(data.isSample);

      const log = await this.trafficLogModel.create({
        path: data.path || '/',
        referrer: data.referrer || '',
        ipAddress: cleanIp,
        userAgent: (data.userAgent || '').substring(0, 500),
        deviceType,
        browser,
        userId: data.userId ? new Types.ObjectId(data.userId) : null,
        isSample,
      });

      this.logger.debug(`[Traffic] Recorded ${isSample ? 'SAMPLE' : 'LIVE'} visit: ${data.path} from IP ${cleanIp}`);
      return log;
    } catch (err: any) {
      this.logger.warn(`Failed to record traffic: ${err.message}`);
      return null;
    }
  }


  async getTrafficStats(filter: 'all' | 'real' | 'sample' = 'all') {
    const now = new Date();
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnNow = new Date(now.getTime() + vnOffsetMs);
    const startOfVnToday = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0) - vnOffsetMs);
    const endOfVnToday = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 23, 59, 59, 999) - vnOffsetMs);

    const startOfVnYear = new Date(Date.UTC(vnNow.getUTCFullYear(), 0, 1, 0, 0, 0) - vnOffsetMs);
    const endOfVnYear = new Date(Date.UTC(vnNow.getUTCFullYear(), 11, 31, 23, 59, 59, 999) - vnOffsetMs);

    const sampleQuery = {
      $or: [
        { isSample: true },
        { ipAddress: { $in: KNOWN_SAMPLE_IPS } },
      ],
    };
    const realQuery = {
      isSample: { $ne: true },
      ipAddress: { $nin: KNOWN_SAMPLE_IPS },
    };

    let baseMatch: Record<string, any> = {};
    if (filter === 'real') {
      baseMatch = realQuery;
    } else if (filter === 'sample') {
      baseMatch = sampleQuery;
    }

    const [
      totalCount,
      uniqueIps,
      todayCount,
      todayUniqueIps,
      yearCount,
      yearUniqueIps,
      hourlyRaw,
      monthlyRaw,
      dailyRaw,
      topPagesRaw,
      devicesRaw,
      browsersRaw,
      recentVisitsRaw,
      totalRealCount,
      totalSampleCount,
      realUniqueIps,
    ] = await Promise.all([
      this.trafficLogModel.countDocuments(baseMatch),
      this.trafficLogModel.distinct('ipAddress', baseMatch),
      this.trafficLogModel.countDocuments({ ...baseMatch, createdAt: { $gte: startOfVnToday, $lte: endOfVnToday } }),
      this.trafficLogModel.distinct('ipAddress', { ...baseMatch, createdAt: { $gte: startOfVnToday, $lte: endOfVnToday } }),
      this.trafficLogModel.countDocuments({ ...baseMatch, createdAt: { $gte: startOfVnYear, $lte: endOfVnYear } }),
      this.trafficLogModel.distinct('ipAddress', { ...baseMatch, createdAt: { $gte: startOfVnYear, $lte: endOfVnYear } }),
      this.trafficLogModel.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: startOfVnToday, $lte: endOfVnToday } } },
        { $project: { hour: { $hour: { date: '$createdAt', timezone: '+07:00' } }, ipAddress: 1 } },
        { $group: { _id: '$hour', views: { $sum: 1 }, ips: { $addToSet: '$ipAddress' } } },
        { $sort: { _id: 1 } },
      ]),
      this.trafficLogModel.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: startOfVnYear, $lte: endOfVnYear } } },
        { $project: { month: { $month: { date: '$createdAt', timezone: '+07:00' } }, ipAddress: 1 } },
        { $group: { _id: '$month', views: { $sum: 1 }, ips: { $addToSet: '$ipAddress' } } },
        { $sort: { _id: 1 } },
      ]),
      this.trafficLogModel.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } } },
        { $project: { day: { $dateToString: { format: '%d/%m', date: '$createdAt', timezone: '+07:00' } }, ipAddress: 1 } },
        { $group: { _id: '$day', views: { $sum: 1 }, ips: { $addToSet: '$ipAddress' } } },
        { $sort: { _id: 1 } },
      ]),
      this.trafficLogModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$path', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 8 },
      ]),
      this.trafficLogModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$deviceType', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
      ]),
      this.trafficLogModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$browser', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
      ]),
      this.trafficLogModel.find(baseMatch).sort({ createdAt: -1 }).limit(20).select('path ipAddress deviceType browser referrer isSample createdAt').lean().exec(),
      this.trafficLogModel.countDocuments(realQuery),
      this.trafficLogModel.countDocuments(sampleQuery),
      this.trafficLogModel.distinct('ipAddress', realQuery),
    ]);


    const sampleIpsSet = new Set(KNOWN_SAMPLE_IPS);
    const recentVisits = recentVisitsRaw.map((v: any) => ({
      ...v,
      isSample: v.isSample === true || sampleIpsSet.has(v.ipAddress),
    }));

    const hourlyMap = new Map<number, { views: number; uniqueVisitors: number }>();
    hourlyRaw.forEach((i) => hourlyMap.set(i._id, { views: i.views, uniqueVisitors: i.ips?.length || 0 }));
    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
      hour: `${h.toString().padStart(2, '0')}:00`,
      hourNum: h,
      views: hourlyMap.get(h)?.views || 0,
      uniqueVisitors: hourlyMap.get(h)?.uniqueVisitors || 0,
    }));

    const monthlyMap = new Map<number, { views: number; uniqueVisitors: number }>();
    monthlyRaw.forEach((i) => monthlyMap.set(i._id, { views: i.views, uniqueVisitors: i.ips?.length || 0 }));
    const monthlyDistribution = Array.from({ length: 12 }, (_, m) => ({
      month: `T${m + 1}`,
      monthLabel: `Tháng ${m + 1}`,
      monthNum: m + 1,
      views: monthlyMap.get(m + 1)?.views || 0,
      uniqueVisitors: monthlyMap.get(m + 1)?.uniqueVisitors || 0,
    }));

    const totalTop = topPagesRaw.reduce((sum, p) => sum + p.views, 0) || 1;
    const topPages = topPagesRaw.map((p) => ({
      path: p._id || '/',
      views: p.views,
      percentage: Math.round((p.views / totalTop) * 100),
    }));

    const devices = devicesRaw.map((d) => ({
      type: d._id || 'desktop',
      label: d._id === 'mobile' ? 'Điện thoại' : d._id === 'tablet' ? 'Máy tính bảng' : 'Máy tính bàn',
      views: d.views,
      percentage: totalCount > 0 ? Math.round((d.views / totalCount) * 100) : 0,
    }));

    const browsers = browsersRaw.map((b) => ({
      name: b._id || 'Khác',
      views: b.views,
      percentage: totalCount > 0 ? Math.round((b.views / totalCount) * 100) : 0,
    }));

    return {
      overview: {
        totalViews: totalCount,
        totalUniqueVisitors: uniqueIps.length,
        todayViews: todayCount,
        todayUniqueVisitors: todayUniqueIps.length,
        yearViews: yearCount,
        yearUniqueVisitors: yearUniqueIps.length,
        currentYear: vnNow.getUTCFullYear(),
        realViews: totalRealCount,
        realUniqueVisitors: realUniqueIps.length,
        sampleViews: totalSampleCount,
        hasRealData: totalRealCount > 0,
        filter,
      },
      today: {
        views: todayCount,
        uniqueVisitors: todayUniqueIps.length,
        hourly: hourlyDistribution,
      },
      thisYear: {
        views: yearCount,
        uniqueVisitors: yearUniqueIps.length,
        year: vnNow.getUTCFullYear(),
        monthly: monthlyDistribution,
      },
      daily: dailyRaw.map((d) => ({ date: d._id, views: d.views, uniqueVisitors: d.ips?.length || 0 })),
      topPages,
      devices,
      browsers,
      recentVisits,
    };
  }


  async clearSampleTraffic() {
    const result = await this.trafficLogModel.deleteMany({
      $or: [
        { isSample: true },
        { ipAddress: { $in: KNOWN_SAMPLE_IPS } },
      ],
    });
    this.logger.log(`Cleared ${result.deletedCount} sample traffic logs`);
    return { deletedCount: result.deletedCount };
  }

  async seedSampleTraffic(force: boolean = false) {
    if (!force) {
      const count = await this.trafficLogModel.countDocuments();
      if (count > 0) return { created: 0 };
    }

    this.logger.log('Generating initial sample traffic statistics...');
    const now = new Date();
    const sampleLogs: any[] = [];
    const samplePaths = [
      '/',
      '/',
      '/events/anh-trai-say-hi-live-concert-2026',
      '/events/anh-trai-say-hi-live-concert-2026',
      '/events/ha-anh-tuan-sketch-a-rose-tour',
      '/checkout/sample-order-01',
      '/checkin',
      '/my-tickets',
      '/login',
      '/wishlist',
    ];

    const sampleUserAgents = [
      { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36', deviceType: 'desktop', browser: 'Chrome' },
      { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1', deviceType: 'mobile', browser: 'Safari' },
      { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/122.0.0.0 Mobile Safari/537.36', deviceType: 'mobile', browser: 'Chrome' },
      { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', deviceType: 'desktop', browser: 'Safari' },
    ];

    for (let h = 0; h <= now.getHours(); h++) {
      const baseCount = (h >= 8 && h <= 12) || (h >= 19 && h <= 22) ? 10 : 3;
      const countForHour = Math.floor(Math.random() * 5) + baseCount;

      for (let i = 0; i < countForHour; i++) {
        const logDate = new Date(now);
        logDate.setHours(h, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
        const uaItem = sampleUserAgents[Math.floor(Math.random() * sampleUserAgents.length)];
        sampleLogs.push({
          path: samplePaths[Math.floor(Math.random() * samplePaths.length)],
          ipAddress: KNOWN_SAMPLE_IPS[Math.floor(Math.random() * KNOWN_SAMPLE_IPS.length)],
          userAgent: uaItem.ua,
          deviceType: uaItem.deviceType,
          browser: uaItem.browser,
          referrer: i % 2 === 0 ? 'https://google.com' : 'https://facebook.com',
          isSample: true,
          createdAt: logDate,
        });
      }
    }

    const currentMonth = now.getMonth();
    for (let m = 0; m < currentMonth; m++) {
      const logsForMonth = 35 + Math.floor(Math.random() * 30);
      for (let i = 0; i < logsForMonth; i++) {
        const logDate = new Date(now.getFullYear(), m, Math.floor(Math.random() * 28) + 1, Math.floor(Math.random() * 24));
        const uaItem = sampleUserAgents[Math.floor(Math.random() * sampleUserAgents.length)];
        sampleLogs.push({
          path: samplePaths[Math.floor(Math.random() * samplePaths.length)],
          ipAddress: KNOWN_SAMPLE_IPS[Math.floor(Math.random() * KNOWN_SAMPLE_IPS.length)],
          userAgent: uaItem.ua,
          deviceType: uaItem.deviceType,
          browser: uaItem.browser,
          referrer: 'https://google.com',
          isSample: true,
          createdAt: logDate,
        });
      }
    }

    if (sampleLogs.length > 0) {
      await this.trafficLogModel.insertMany(sampleLogs);
    }

    return { created: sampleLogs.length };
  }

  async seedSampleTrafficIfEmpty() {
    const count = await this.trafficLogModel.countDocuments();
    if (count > 0) return;
    await this.seedSampleTraffic(false);
  }
}

