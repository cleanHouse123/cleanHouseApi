import { Injectable } from '@nestjs/common';
import { Connection } from 'typeorm';

@Injectable()
export class HealthCheckService {
  constructor(private readonly connection: Connection) {}
  async healthCheckDb(): Promise<string> {
    try {
      await this.connection.query('SELECT 1');
      return 'Connected to DB!';
    } catch (error) {
      return `DB connection error: ${error.message}`;
    }
  }
}
