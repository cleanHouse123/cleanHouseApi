import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FcmService } from './fcm.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/roles.guard';
import { Roles } from '../shared/decorators/roles.decorator';
import { UserRole } from '../shared/types/user.role';

@ApiTags('FCM')
@Controller('fcm')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
export class FcmController {
  private readonly logger = new Logger(FcmController.name);

  constructor(private readonly fcmService: FcmService) {}

  @Post('send-notification')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Отправить push-уведомление на устройство по device token',
    description:
      'Отправляет push-уведомление на указанное устройство. Доступно только для администраторов.',
  })
  @ApiResponse({
    status: 200,
    description: 'Уведомление успешно отправлено',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        messageId: { type: 'string', nullable: true },
        error: { type: 'string', nullable: true },
        code: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Неверные данные запроса',
  })
  @ApiResponse({
    status: 401,
    description: 'Не авторизован',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ запрещен (только для администраторов)',
  })
  async sendNotification(
    @Body() sendNotificationDto: SendNotificationDto,
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    code?: string;
  }> {
    this.logger.log(
      `Отправка push-уведомления на устройство: ${sendNotificationDto.deviceToken.substring(0, 30)}...`,
    );

    const result = await this.fcmService.sendNotificationToDevice(
      sendNotificationDto.deviceToken,
      sendNotificationDto.title,
      sendNotificationDto.body,
      sendNotificationDto.payload,
    );

    if (result.success) {
      this.logger.log(
        `Push-уведомление успешно отправлено. MessageId: ${result.messageId}`,
      );
    } else {
      this.logger.warn(
        `Ошибка отправки push-уведомления: ${result.error} (code: ${result.code})`,
      );
    }

    return result;
  }
}
