import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../schemas/user.schema';
import { SeatStatus } from '../../schemas/seat.schema';
import {
  CreateAdminEventDto,
  UpdateAdminEventDto,
  CreateAdminTierDto,
  UpdateAdminTierDto,
  CreateCouponDto,
  UpdateCouponDto,
  UpdateSeatStatusDto,
  UpdateSecuritySettingDto,
  RestoreBackupDto,
  InspectBackupDto,
} from './dto/admin.dto';


@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // User Management
  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.adminService.getUsers(search, role, isActive);
  }

  @Put('users/:id/toggle-status')
  async toggleUserStatus(
    @Param('id', ObjectIdPipe) userId: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.toggleUserStatus(userId, adminId);
  }

  // Event Management
  @Get('events')
  async getEvents(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getEvents(search, status);
  }

  @Post('events')
  async createEvent(
    @Body() dto: CreateAdminEventDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.createEvent(dto, adminId);
  }

  @Put('events/:id')
  async updateEvent(
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateAdminEventDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateEvent(id, dto, adminId);
  }

  @Delete('events/:id')
  async deleteEvent(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.deleteEvent(id, adminId);
  }

  // Ticket Tiers
  @Get('events/:eventId/tiers')
  async getTiers(@Param('eventId', ObjectIdPipe) eventId: string) {
    return this.adminService.getEventTiers(eventId);
  }

  @Post('events/:eventId/tiers')
  async createTier(
    @Param('eventId', ObjectIdPipe) eventId: string,
    @Body() dto: CreateAdminTierDto,
  ) {
    return this.adminService.createTier(eventId, dto);
  }

  @Put('tiers/:id')
  async updateTier(@Param('id', ObjectIdPipe) id: string, @Body() dto: UpdateAdminTierDto) {
    return this.adminService.updateTier(id, dto);
  }

  @Delete('tiers/:id')
  async deleteTier(@Param('id', ObjectIdPipe) id: string) {
    return this.adminService.deleteTier(id);
  }

  // Seat Management
  @Get('events/:eventId/seats')
  async getSeats(@Param('eventId', ObjectIdPipe) eventId: string) {
    return this.adminService.getEventSeats(eventId);
  }

  @Put('seats/:id/status')
  async updateSeatStatus(
    @Param('id', ObjectIdPipe) seatId: string,
    @Body() dto: UpdateSeatStatusDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateSeatStatus(seatId, dto.status, adminId);
  }

  // Orders Management
  @Get('orders')
  async getOrders(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getOrders(search, status);
  }

  // Payment Management (UC21)
  @Get('payments')
  async getPayments(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getPayments(search, status);
  }

  // Coupons Management
  @Get('coupons')
  async getCoupons() {
    return this.adminService.getCoupons();
  }

  @Post('coupons')
  async createCoupon(
    @Body() dto: CreateCouponDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.createCoupon(dto, adminId);
  }

  @Put('coupons/:id')
  async updateCoupon(
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateCoupon(id, dto, adminId);
  }

  @Delete('coupons/:id')
  async deleteCoupon(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.deleteCoupon(id, adminId);
  }

  // Audit Logs
  @Get('audit-logs')
  async getAuditLogs(@Query('limit') limit?: number) {
    return this.adminService.getAuditLogs(limit ? Number(limit) : 50);
  }

  @Put('users/:id/unlock-login')
  async unlockUserLogin(
    @Param('id', ObjectIdPipe) userId: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.unlockUserLogin(userId, adminId);
  }

  // Security Settings
  @Get('settings/security')
  async getSecuritySettings() {
    return this.adminService.getSecuritySettings();
  }

  @Put('settings/security')
  async updateSecuritySettings(
    @Body() dto: UpdateSecuritySettingDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateSecuritySettings(dto, adminId);
  }

  // Traffic & Analytics
  @Get('traffic-stats')
  async getTrafficStats(@Query('filter') filter?: 'all' | 'real' | 'sample') {
    return this.adminService.getTrafficStats(filter);
  }

  @Post('traffic/clear-sample')
  async clearSampleTraffic() {
    return this.adminService.clearSampleTraffic();
  }

  @Post('traffic/seed-sample')
  async seedSampleTraffic() {
    return this.adminService.seedSampleTraffic();
  }
  // Database Backup & Restore
  @Get('database/overview')
  async getDatabaseOverview() {
    return this.adminService.getBackupOverview();
  }

  @Get('database/export')
  async exportDatabase(
    @Query('collections') collections: string,
    @Query('download') download: string,
    @CurrentUser('userId') adminId: string,
    @Res() res: Response,
  ) {
    const backup = await this.adminService.exportBackup(collections, adminId);
    if (download === 'true' || download === '1') {
      const filename = `tickticket-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(backup, null, 2));
    }
    return res.json({ success: true, data: backup });
  }

  @Post('database/inspect')
  async inspectDatabaseBackup(@Body() dto: InspectBackupDto) {
    return this.adminService.inspectBackup(dto.data, dto.targetCollection);
  }

  @Post('database/restore')
  async restoreDatabase(
    @Body() dto: RestoreBackupDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.restoreBackup(dto, adminId);
  }

  @Get('database/history')
  async getDatabaseHistory(@Query('limit') limit?: number) {
    return this.adminService.getBackupHistory(limit ? Number(limit) : 20);
  }

}

