import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userModel.findById(payload.sub).select('+lockedUntil +tokenVersion').lean().exec();
    if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date()) || (payload.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      throw new UnauthorizedException('User not found or token invalid');
    }
    delete user.lockedUntil;
    delete user.tokenVersion;
    return user;
  }
}
