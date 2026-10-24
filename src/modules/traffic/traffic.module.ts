import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrafficLog, TrafficLogSchema } from '../../schemas/traffic-log.schema';
import { TrafficService } from './traffic.service';
import { TrafficController } from './traffic.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrafficLog.name, schema: TrafficLogSchema },
    ]),
  ],
  controllers: [TrafficController],
  providers: [TrafficService],
  exports: [TrafficService],
})
export class TrafficModule implements OnModuleInit {
  constructor(private readonly trafficService: TrafficService) {}

  async onModuleInit() {
    await this.trafficService.seedSampleTrafficIfEmpty();
  }
}
