import { Controller, Post, Body, Req, Ip, Headers } from '@nestjs/common';
import { Request } from 'express';
import { TrafficService } from './traffic.service';
import { TrackTrafficDto } from '../admin/dto/admin.dto';

@Controller(['traffic', 'analytics'])
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @Post(['track', 'ping'])
  async track(
    @Body() dto: TrackTrafficDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Req() req: Request,
  ) {
    const rawIp =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      ip ||
      req.socket?.remoteAddress ||
      '';
    const clientIp = rawIp.split(',')[0].trim();

    let userId: string | undefined = undefined;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          userId = payload.userId || payload.sub || payload._id;
        }
      } catch {
        // ignore decode failure
      }
    }

    const recordedLog = await this.trafficService.recordTraffic({
      path: dto.path,
      referrer: dto.referrer,
      ipAddress: clientIp,
      userAgent: userAgent || '',
      userId,
      isSample: false,
    });

    return {
      success: true,
      recorded: Boolean(recordedLog),
    };
  }
}

