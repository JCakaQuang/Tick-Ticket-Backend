import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from '../../schemas/user.schema';
import { SystemSetting, SystemSettingDocument } from '../../schemas/system-setting.schema';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SystemSetting.name) private readonly systemSettingModel: Model<SystemSettingDocument>,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getSecuritySetting(): Promise<{ maxFailedLoginAttempts: number; lockoutDurationMinutes: number }> {
    try {
      const setting = await this.systemSettingModel.findOne({ key: 'security' }).lean().exec();
      if (setting) {
        return {
          maxFailedLoginAttempts: Number(setting.maxFailedLoginAttempts) || 5,
          lockoutDurationMinutes: Number(setting.lockoutDurationMinutes) || 15,
        };
      }
    } catch {
      // fallback to default
    }
    return { maxFailedLoginAttempts: 5, lockoutDurationMinutes: 15 };
  }


  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = new this.userModel({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber,
      role: UserRole.USER,
      isActive: true,
    });

    try {
      await user.save();
    } catch (error) {
      if (error.code === 11000) throw new ConflictException('Email or phone number already registered');
      throw error;
    }

    const token = this.generateToken(user);
    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      token,
    };
  }

  async login(dto: LoginDto) {
    const identifier = dto.email.trim();
    const isEmail = identifier.includes('@');
    const user = await this.userModel
      .findOne(
        isEmail
          ? { email: identifier.toLowerCase() }
          : { phoneNumber: identifier },
      )
      .select('+passwordHash +failedLoginAttempts +lockedUntil +tokenVersion')
      .exec();
    if (!user) {
      throw new UnauthorizedException('Email, số điện thoại hoặc mật khẩu không chính xác');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const securityConfig = await this.getSecuritySetting();
    const maxFailedLogins = securityConfig.maxFailedLoginAttempts;
    const lockoutDurationMs = securityConfig.lockoutDurationMinutes * 60 * 1000;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      throw new UnauthorizedException(
        `Tài khoản đang bị tạm khóa. Vui lòng thử lại sau ${remainingMinutes} phút hoặc liên hệ Quản trị viên để mở khóa.`
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      const now = new Date();
      const failed = await this.userModel.findOneAndUpdate(
        { _id: user._id, isActive: true, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
        [
          { $set: { failedLoginAttempts: { $cond: [
            { $and: [{ $ne: [{ $ifNull: ['$lockedUntil', null] }, null] }, { $lte: ['$lockedUntil', now] }] },
            1, { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] },
          ] } } },
          { $set: { lockedUntil: { $cond: [
            { $gte: ['$failedLoginAttempts', maxFailedLogins] }, new Date(now.getTime() + lockoutDurationMs), null,
          ] } } },
        ],
        { new: true },
      ).select('+failedLoginAttempts +lockedUntil');

      const isLocked = Boolean(failed?.lockedUntil && failed.lockedUntil > now);
      await this.auditLogService.log({
        userId: user._id,
        action: isLocked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
        targetCollection: 'users',
        targetId: user._id,
        metadata: {
          failedAttempts: failed?.failedLoginAttempts || 1,
          maxAllowed: maxFailedLogins,
          lockedUntil: failed?.lockedUntil,
        },
      });

      if (isLocked) {
        throw new UnauthorizedException(
          `Tài khoản đã bị tạm khóa ${securityConfig.lockoutDurationMinutes} phút do nhập sai mật khẩu ${maxFailedLogins} lần liên tiếp.`
        );
      }

      const currentAttempts = failed?.failedLoginAttempts || 1;
      const remaining = Math.max(0, maxFailedLogins - currentAttempts);
      throw new UnauthorizedException(
        `Email, số điện thoại hoặc mật khẩu không chính xác. Bạn còn ${remaining} lần thử trước khi tài khoản bị khóa.`
      );
    }


    const authenticated = await this.userModel.findOneAndUpdate(
      { _id: user._id, isActive: true, passwordHash: user.passwordHash, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: new Date() } }] },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      { new: true },
    ).select('+tokenVersion');
    if (!authenticated) throw new UnauthorizedException('Account is locked or deactivated');
    await this.auditLogService.log({ userId: user._id, action: 'LOGIN_SUCCESS', targetCollection: 'users', targetId: user._id });
    const token = this.generateToken(authenticated);
    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      token,
    };
  }

  async getProfile(userId: string): Promise<Pick<User, 'fullName' | 'email' | 'phoneNumber' | 'role' | 'isActive' | 'wishlist'> & { id: string }> {
    const user = await this.userModel.findById(userId).select('-passwordHash').lean().exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { ...user, id: user._id.toString() };
  }

  private generateToken(user: UserDocument): string {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    };
    return this.jwtService.sign(payload);
  }
}
