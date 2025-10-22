import { Module } from '@nestjs/common';
import { SmsProviderService } from './services/sms-provider.service';
import { WahaService } from './services/waha.service';
import { SmsRuService } from './services/smsru.service';

@Module({
  providers: [SmsProviderService, WahaService, SmsRuService],
  exports: [SmsProviderService, WahaService, SmsRuService],
})
export class SmsModule {}
