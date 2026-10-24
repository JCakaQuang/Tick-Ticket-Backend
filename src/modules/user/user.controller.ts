import { ObjectIdPipe } from '../../common/pipes/object-id.pipe';
import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('wishlist')
  async getWishlist(@CurrentUser('userId') userId: string) {
    return this.userService.getWishlist(userId);
  }

  @Post('wishlist/:eventId')
  async toggleWishlist(
    @CurrentUser('userId') userId: string,
    @Param('eventId', ObjectIdPipe) eventId: string,
  ) {
    return this.userService.toggleWishlist(userId, eventId);
  }

  @Get('wishlist/:eventId/status')
  async checkWishlist(
    @CurrentUser('userId') userId: string,
    @Param('eventId', ObjectIdPipe) eventId: string,
  ) {
    return this.userService.checkWishlist(userId, eventId);
  }
}
