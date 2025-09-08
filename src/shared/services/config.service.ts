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
    return baseUrl.startsWith('https')
      ? baseUrl.replace('https', 'wss')
      : baseUrl.replace('http', 'ws');
  }
}
