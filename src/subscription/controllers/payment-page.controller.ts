import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { SharedConfigService } from '../../shared/services/config.service';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller('payment')
export class PaymentPageController {
  private readonly logger = new Logger(PaymentPageController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: SharedConfigService,
  ) {}

  @Get(':paymentId')
  async showPaymentForm(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ) {
    try {
      // Проверяем существование платежа
      const payment = await this.paymentService.getPayment(paymentId);

      if (!payment) {
        return res.status(404).send('Платеж не найден');
      }

      if (payment.status !== 'pending') {
        return res.status(400).send('Платеж уже обработан');
      }

      // Читаем HTML шаблон
      const templatePath = join(
        process.cwd(),
        'dist',
        'subscription',
        'templates',
        'payment-form.html',
      );

      this.logger.log(`Пытаемся загрузить шаблон из: ${templatePath}`);

      let html = readFileSync(templatePath, 'utf8');

      // Заменяем параметры в HTML
      html = html.replace(
        "const paymentId = urlParams.get('paymentId') || 'test-payment-id';",
        `const paymentId = '${paymentId}';`,
      );

      html = html.replace(
        "const amount = urlParams.get('amount') || '1000';",
        `const amount = '${payment.amount}';`,
      );

      html = html.replace(
        "const type = urlParams.get('type') || 'monthly';",
        `const type = '${payment.subscriptionType || 'monthly'}';`,
      );

      // Заменяем WebSocket URL
      const wsUrl = this.configService.getWebSocketUrl();
      html = html.replace('{{WEBSOCKET_URL}}', wsUrl);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      this.logger.error(
        `Ошибка загрузки формы оплаты для paymentId: ${paymentId}`,
        error,
      );
      res.status(500).send(`Ошибка загрузки формы оплаты: ${error.message}`);
    }
  }
}
