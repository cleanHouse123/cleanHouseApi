import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAddress } from '../entities/user-address';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';
import { UserAddressService } from '../service/user-address.service';
import { GetUserMetadata, UserMetadata } from 'src/shared/decorators/get-user.decorator';

@ApiTags('user-address')
@Controller('user-address')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
export class UserAddressController {
  constructor(private readonly userAddressService: UserAddressService) {}

  @ApiOperation({ summary: 'Получить адреса пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Список адресов пользователя',
    type: [UserAddress],
  })
  @Get()
  async getUserAddresses(@GetUserMetadata() user: UserMetadata): Promise<UserAddress[]> {
    const userId = user.userId;
    return this.userAddressService.getUserAddresses(userId);
  }

  @ApiOperation({ summary: 'Получить адрес пользователя по id' })
  @ApiResponse({
    status: 200,
    description: 'Адрес пользователя',
    type: UserAddress,
  })
  @Get(':id')
  async getUserAddressById(@Param('id') id: string, @GetUserMetadata() user: UserMetadata): Promise<UserAddress[]> {
    return this.userAddressService.getUserAddresses(id);
  }

  @ApiOperation({ summary: 'Создать адрес пользователя' })
  @ApiBody({ type: CreateUserAddressDto })
  @ApiResponse({
    status: 200,
    description: 'Адрес пользователя',
    type: UserAddress,
  })
  @Post()
  async createUserAddress(
    @Body() createUserAddressDto: CreateUserAddressDto,
    @GetUserMetadata() user: UserMetadata,
  ): Promise<UserAddress> {
    const userId = user.userId;
    return this.userAddressService.createUserAddress(userId, createUserAddressDto);
  }

  @ApiOperation({ summary: 'Удалить адрес пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Адрес успешно удален',
  })
  @Delete(':id')
  async deleteUserAddress(
    @Param('id') id: string,
    @GetUserMetadata() user: UserMetadata,
  ): Promise<void> {
    return this.userAddressService.deleteUserAddress(id);
  }
}
