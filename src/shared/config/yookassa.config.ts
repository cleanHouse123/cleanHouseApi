import { ConfigService } from '@nestjs/config';
import type { YookassaOptions } from 'nestjs-yookassa';

export function getYookassaConfig(
  configService: ConfigService,
): YookassaOptions {
  const useTestMode =
    configService.get<string>('YOOKASSA_USE_TEST_MODE') === 'true';
  const shopId = useTestMode
    ? configService.get<string>('YOOKASSA_SHOP_ID_TEST')
    : configService.get<string>('YOOKASSA_SHOP_ID');
  const apiKey = useTestMode
    ? configService.get<string>('YOOKASSA_SECRET_KEY_TEST')
    : configService.get<string>('YOOKASSA_SECRET_KEY');

  const credSource = useTestMode ? 'TEST' : 'LIVE';
  if (!shopId || !apiKey) {
    throw new Error(
      `YOOKASSA credentials (${credSource}) missing: shopId and secretKey must be set`,
    );
  }

  if (!/^\d+$/.test(shopId)) {
    throw new Error(
      `YOOKASSA_SHOP_ID must contain only digits, got: ${shopId}`,
    );
  }

  return {
    shopId,
    apiKey,
  };
}
