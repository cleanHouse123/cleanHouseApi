import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SharedConfigService {
  constructor(private configService: ConfigService) {}

  getBaseUrl(): string {
    return this.configService.get<string>('BASE_URL', 'http://localhost:3000');
  }

  getWebSocketUrl(): string {
    const baseUrl = this.getBaseUrl();
    // Если это HTTPS, используем WSS, иначе WS
    const wsUrl = baseUrl.startsWith('https')
      ? baseUrl.replace('https', 'wss')
      : baseUrl.replace('http', 'ws');

    // Добавляем порт если его нет в URL
    if (
      !wsUrl.includes(':3000') &&
      !wsUrl.includes(':80') &&
      !wsUrl.includes(':443')
    ) {
      return `${wsUrl}:3000`;
    }

    return wsUrl;
  }
}
