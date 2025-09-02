import { Module } from '@nestjs/common';
import { HealthCheckController } from './healthCheck.controller';
import { HealthCheckService } from './healthCheck.service';

@Module({
  imports: [],
  controllers: [HealthCheckController],
  providers: [HealthCheckService],
})
export class HealthCheckModule {}
