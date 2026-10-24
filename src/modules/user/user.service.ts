import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';
import { Event, EventDocument } from '../../schemas/event.schema';
import { TicketTier, TicketTierDocument } from '../../schemas/ticket-tier.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(TicketTier.name) private tierModel: Model<TicketTierDocument>,
  ) {}

  async getWishlist(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({
        path: 'wishlist',
        model: 'Event',
      })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng.');
    }

    const rawWishlist = (user.wishlist || []).filter(Boolean);
    const eventIds = rawWishlist.map((e: any) => e._id);
    const tiers = await this.tierModel.find({ eventId: { $in: eventIds } }).lean().exec();
    const tiersByEvent = new Map<string, any[]>();
    for (const t of tiers) {
      const eid = t.eventId.toString();
      if (!tiersByEvent.has(eid)) tiersByEvent.set(eid, []);
      tiersByEvent.get(eid)!.push(t);
    }

    return rawWishlist.map((e: any) => {
      const evTiers = tiersByEvent.get(e._id.toString()) || [];
      const minTierPrice =
        evTiers.length > 0
          ? Math.min(...evTiers.map((t) => Number(t.price) || 0))
          : (Number(e.minPrice) || Number(e.startingPrice) || 0);

      return {
        ...e,
        seatingType: e.type || e.seatingType,
        tiers: evTiers,
        minPrice: minTierPrice,
        startingPrice: minTierPrice,
        venue: e.location,
        date: e.startTime,
      };
    });
  }

  async toggleWishlist(userId: string, eventId: string) {
    const eventObjectId = new Types.ObjectId(eventId);
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    const currentList = user.wishlist || [];
    const index = currentList.findIndex((id) => id.toString() === eventId);

    let inWishlist = false;
    if (index > -1) {
      // Remove
      user.wishlist.splice(index, 1);
      inWishlist = false;
    } else {
      // Add
      user.wishlist.push(eventObjectId);
      inWishlist = true;
    }

    await user.save();
    return {
      inWishlist,
      wishlistCount: user.wishlist.length,
      message: inWishlist
        ? 'Đã thêm sự kiện vào danh sách yêu thích!'
        : 'Đã xóa sự kiện khỏi danh sách yêu thích!',
    };
  }

  async checkWishlist(userId: string, eventId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) return { inWishlist: false };
    const inWishlist = (user.wishlist || []).some((id) => id.toString() === eventId);
    return { inWishlist };
  }
}
