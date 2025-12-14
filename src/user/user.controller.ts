import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/shared/decorators/roles.decorator';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { UserRole } from 'src/shared/types/user.role';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminResponseDto } from './dto/admin-response.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UserService } from './user.service';
import { UsersListDto } from './dto/users-list.dto';
import { FindUsersQueryDto } from './dto/filter-users.dto';
import { CreateCurrierDto } from './dto/create-currier.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddDeviceTokenDto } from './dto/add-device-token.dto';
import {
  GetUserMetadata,
  UserMetadata,
} from 'src/shared/decorators/get-user.decorator';
import { Public } from 'src/shared/decorators/public.decorator';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('admins')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdmins(): Promise<AdminResponseDto[]> {
    const admins = await this.userService.getAdmins();
    return admins;
  }

  @Post('admin')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBody({
    type: CreateAdminDto,
    description: 'Данные для создания нового администратора',
  })
  async createAdmin(
    @Body() createAdminDto: CreateAdminDto,
  ): Promise<AdminResponseDto> {
    const admin = await this.userService.createAdmin(createAdminDto);

    const { hash_password, refreshTokenHash, ...adminResponse } = admin;
    return {
      ...(adminResponse as AdminResponseDto),
    };
  }

  @Post('currier')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBody({
    type: CreateCurrierDto,
    description: 'Данные для создания нового курьера',
  })
  async createCurrier(
    @Body() createCurrierDto: CreateCurrierDto,
  ): Promise<UsersListDto> {
    const currier = await this.userService.createCurrier(createCurrierDto);

    const { hash_password, refreshTokenHash, ...currierResponse } = currier;
    return {
      ...(currierResponse as UsersListDto),
    };
  }

  @Get('all')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllUsers(@Query() query: FindUsersQueryDto): Promise<{
    data: UsersListDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return await this.userService.getAllUsers(query);
  }

  @Delete('admin/:id')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async removeAdmin(@Param('id') id: string): Promise<{ message: string }> {
    await this.userService.removeAdmin(id);
    return { message: 'Администратор успешно удален' };
  }

  @Patch('add-device-token')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @ApiBody({
    type: AddDeviceTokenDto,
    description: 'Добавить/обновить FCM device token',
  })
  async addDeviceToken(
    @GetUserMetadata() user: UserMetadata,
    @Body() addDeviceTokenDto: AddDeviceTokenDto,
  ): Promise<{ message: string }> {
    await this.userService.updateDeviceToken(
      user.userId,
      addDeviceTokenDto.token,
    );
    console.log('addDeviceTokenDto', addDeviceTokenDto);
    console.log('user', user);
    return { message: 'Device token успешно обновлен' };
  }

  @Patch(':id')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBody({
    type: UpdateUserDto,
    description: 'Данные для обновления пользователя',
  })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UsersListDto> {
    const user = await this.userService.update(id, updateUserDto);
    const { hash_password, refreshTokenHash, ...userResponse } = user;
    return userResponse as UsersListDto;
  }

  @Delete(':id')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async removeUser(@Param('id') id: string): Promise<{ message: string }> {
    await this.userService.remove(id);
    return { message: 'Пользователь успешно удален' };
  }
}
