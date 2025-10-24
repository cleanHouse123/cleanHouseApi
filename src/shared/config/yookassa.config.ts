import { ConfigService } from '@nestjs/config';
import type { YookassaOptions } from 'nestjs-yookassa';

export function getYookassaConfig(
  configService: ConfigService,
): YookassaOptions {
  const shopId = configService.get<string>('YOOKASSA_SHOP_ID');
  const apiKey = configService.get<string>('YOOKASSA_SECRET_KEY');

  // Детальное логирование для отладки
  console.log('=== YooKassa Configuration Debug ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log(
    'YOOKASSA_SHOP_ID:',
    shopId ? `${shopId} (length: ${shopId.length})` : 'NOT SET',
  );
  console.log(
    'YOOKASSA_SECRET_KEY:',
    apiKey
      ? `${apiKey.substring(0, 10)}... (length: ${apiKey.length})`
      : 'NOT SET',
  );
  console.log(
    'All env vars starting with YOOKASSA:',
    Object.keys(process.env)
      .filter((key) => key.startsWith('YOOKASSA'))
      .reduce(
        (obj, key) => {
          obj[key] = process.env[key]?.substring(0, 10) + '...';
          return obj;
        },
        {} as Record<string, string>,
      ),
  );

  if (!shopId || !apiKey) {
    console.error('YooKassa credentials missing!');
    throw new Error(
      'YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY должны быть установлены',
    );
  }

  // Проверяем формат shopId
  if (!/^\d+$/.test(shopId)) {
    console.error('Invalid shopId format:', shopId);
    throw new Error(
      `YOOKASSA_SHOP_ID должен содержать только цифры, получен: ${shopId}`,
    );
  }

  console.log('YooKassa config created successfully');
  console.log('=====================================');

  return {
    shopId,
    apiKey,
  };
}
