import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditLogSchema } from '../../schemas/audit-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}