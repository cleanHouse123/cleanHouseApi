import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('time')
  getTime() {
    const now = new Date();
    return {
      utc: now.toISOString(),
      local: now.toString(),
      timezone: process.env.TZ || 'not set',
      timestamp: now.getTime(),
    };
  }
}
