import { ConfigService } from '@nestjs/config';
import type { YookassaOptions } from 'nestjs-yookassa';

export function getYookassaConfig(
  configService: ConfigService,
): YookassaOptions {
  const shopId = configService.get<string>('YOOKASSA_SHOP_ID');
  const apiKey = configService.get<string>('YOOKASSA_SECRET_KEY');

  if (!shopId || !apiKey) {
    throw new Error(
      'YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY должны быть установлены',
    );
  }

  return {
    shopId,
    apiKey,
  };
}
