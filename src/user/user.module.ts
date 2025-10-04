import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { AdTokenModule } from '../ad-tokens/ad-token.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AdTokenModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
