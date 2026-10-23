import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIpAllowed } from './yookassa-ip';

/**
 * Webhook YooKassa не подписывается — подлинность подтверждается только тем,
 * что запрос пришёл с их адресов. Без этой проверки кто угодно мог прислать
 * `payment.succeeded` со своим paymentId и получить оплаченный заказ даром.
 *
 * Список адресов берётся из YOOKASSA_WEBHOOK_IPS, если он задан: когда
 * YooKassa его поменяет, платежи не должны встать до нашего выката.
 * YOOKASSA_WEBHOOK_ENFORCE_IP=false снимает проверку целиком — аварийный
 * рычаг, если прокси начнёт отдавать не тот адрес.
 */
@Injectable()
export class YookassaWebhookGuard implements CanActivate {
  private readonly logger = new Logger(YookassaWebhookGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = this.extractIp(request);

    // адрес пишем всегда: по логам видно, с чего реально приходят webhook-и
    this.logger.log(`Webhook YooKassa с адреса ${ip ?? 'неизвестно'}`);

    const enforce =
      this.configService.get<string>('YOOKASSA_WEBHOOK_ENFORCE_IP') !== 'false';

    if (!enforce) {
      this.logger.warn(
        'Проверка адреса webhook отключена через YOOKASSA_WEBHOOK_ENFORCE_IP',
      );
      return true;
    }

    const configured = this.configService.get<string>('YOOKASSA_WEBHOOK_IPS');
    const allowList = configured
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (isIpAllowed(ip, allowList)) {
      return true;
    }

    this.logger.warn(`Webhook с чужого адреса отклонён: ${ip ?? 'неизвестно'}`);
    throw new ForbiddenException('Источник webhook не подтверждён');
  }

  /**
   * За прокси реальный адрес приходит в X-Forwarded-For, первым в списке.
   * Беря последний или req.ip, мы бы проверяли адрес самого прокси.
   */
  private extractIp(request: {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string | undefined {
    const forwarded = request.headers?.['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;

    if (raw) {
      return raw.split(',')[0].trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }
}
