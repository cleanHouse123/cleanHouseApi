import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressService } from './service/address.service';
import { AddressController } from './address.controller';
import { AddressCache } from './entities/address-cache.entity';
import { Location } from './entities/location.entity';
import { DaDataService } from './service/dadata.service';
import { UserAddress } from './entities/user-address';
import { UserAddressController } from './controller/user-address.controller';
import { UserAddressService } from './service/user-address.service';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AddressCache, Location, UserAddress, User])],
  controllers: [AddressController, UserAddressController],
  providers: [AddressService, DaDataService, UserAddressService],
  exports: [AddressService, DaDataService, UserAddressService],
})
export class AddressModule {}
