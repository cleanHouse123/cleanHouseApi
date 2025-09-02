import { Controller, Get } from '@nestjs/common';
import { HealthCheckService } from './healthCheck.service';

@Controller('/health-check')
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get('/')
  healthCheck() {
    return 'sucsess';
  }

  @Get('/db')
  async healthCheckDb(): Promise<string> {
    return this.healthCheckService.healthCheckDb();
  }

  @Get('/debug-sentry')
  getError() {
    throw new Error('My first Sentry error!');
  }
}
