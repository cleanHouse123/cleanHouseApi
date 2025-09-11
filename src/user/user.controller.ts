import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

@ApiTags('user')
@Controller('user')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('admins')
  async getAdmins(): Promise<AdminResponseDto[]> {
    const admins = await this.userService.getAdmins();
    return admins;
  }

  @Post('admin')
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  async getAllUsers(@Query() query: FindUsersQueryDto): Promise<{
    data: UsersListDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return await this.userService.getAllUsers(query);
  }
}
