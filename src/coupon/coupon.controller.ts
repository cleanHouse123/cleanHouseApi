import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponValidationResponseDto } from './dto/coupon-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  GetUserMetadata,
  UserMetadata,
} from '../shared/decorators/get-user.decorator';
import { Coupon } from './entities/coupon.entity';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Проверить промокод и получить итоговую цену (превью)',
  })
  validate(
    @Body(ValidationPipe) dto: ValidateCouponDto,
    @GetUserMetadata() user: UserMetadata,
  ): Promise<CouponValidationResponseDto> {
    return this.couponService.validateForPreview(dto, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Список промокодов (админ)' })
  findAll(): Promise<Coupon[]> {
    return this.couponService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Промокод по ID (админ)' })
  findOne(@Param('id') id: string): Promise<Coupon> {
    return this.couponService.findOneById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Создать промокод (админ)' })
  create(@Body(ValidationPipe) dto: CreateCouponDto): Promise<Coupon> {
    return this.couponService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Обновить промокод (админ)' })
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateCouponDto,
  ): Promise<Coupon> {
    return this.couponService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Удалить промокод (только если не использовался)' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.couponService.remove(id);
    return { message: 'Coupon deleted successfully' };
  }
}
