import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressService } from './address.service';
import { AddressController } from './address.controller';
import { AddressCache } from './entities/address-cache.entity';
import { Location } from './entities/location.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AddressCache, Location])],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
