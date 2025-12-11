import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkTimeService } from './work-time.service';
import { WorkTimeController } from './work-time.controller';
import { WorkTime } from './entities/work-time.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkTime])],
  controllers: [WorkTimeController],
  providers: [WorkTimeService],
})
export class WorkTimeModule {}
