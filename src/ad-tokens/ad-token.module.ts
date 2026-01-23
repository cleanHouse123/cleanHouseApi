import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdToken } from './ad-token.entity';
import { User } from '../user/entities/user.entity';
import { AdTokenService } from './ad-token.service';
import { AdTokenAdminController } from './controlers/ad-token.admin.controller';
import { AdTokenController } from './controlers/ad-token.client.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdToken, User])],
  controllers: [AdTokenAdminController, AdTokenController],
  providers: [AdTokenService],
  exports: [AdTokenService],
})
export class AdTokenModule {}
