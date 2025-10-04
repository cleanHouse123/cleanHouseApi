import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdToken } from './ad-token.entity';
import { AdTokenService } from './ad-token.service';
import { AdTokenController } from './ad-token.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdToken])],
  controllers: [AdTokenController],
  providers: [AdTokenService],
  exports: [AdTokenService],
})
export class AdTokenModule {}
