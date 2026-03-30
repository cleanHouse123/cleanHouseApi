import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  Req,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { OrderPaymentService } from '../services/order-payment.service';
import { SharedConfigService } from '../../shared/services/config.service';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller('order-payment')
export class OrderPaymentPageController {
  private readonly logger = new Logger(OrderPaymentPageController.name);

  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly configService: SharedConfigService,
  ) {}

  @Get('yookassa-return')
  async handleYookassaReturn(@Query() query: any, @Res() res: Response) {
    this.logger.log('Возврат с YooKassa. Query params:', query);

    const frontendUrl = this.configService.getFrontendUrl();

    // Простая страница с автоматическим редиректом на фронт
    // Статус платежа обновляется через webhook'и
    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Обработка платежа</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background-color: #f5f5f5;
            text-align: center;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .success-icon {
            font-size: 48px;
            color: #4CAF50;
            margin-bottom: 20px;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #007AFF;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .return-button {
            display: inline-block;
            background: #007AFF;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            margin-top: 20px;
          }
          .return-button:hover {
            background: #0056CC;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Платеж обрабатывается</h1>
          <div class="spinner"></div>
          <p>Ваш платеж обрабатывается. Вы будете автоматически перенаправлены в приложение через несколько секунд.</p>
          <p><small>Статус платежа обновляется через webhook'и от YooKassa</small></p>
          
          <a href="${frontendUrl}" class="return-button">
            🏠 Вернуться в приложение сейчас
          </a>
        </div>

        <script>
          console.log('Возврат с YooKassa, автоматическое перенаправление через 3 секунды');
          
          // Автоматическое перенаправление через 3 секунды
          setTimeout(() => {
            window.location.href = '${frontendUrl}';
          }, 3000);
        </script>
      </body>
      </html>
    `;

    res.send(html);
    return;
  }

  @Get('success/:paymentId')
  async showSuccessPage(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.logger.log(`Показываем success страницу для платежа: ${paymentId}`);

      // Получаем информацию о платеже
      const payment =
        await this.orderPaymentService.checkPaymentStatus(paymentId);

      if (!payment) {
        this.logger.error(`Платеж ${paymentId} не найден`);
        const frontendUrl = this.configService.getFrontendUrl();
        res.redirect(
          `${frontendUrl}/payment-return?type=order&error=payment_not_found`,
        );
        return;
      }

      this.logger.log(
        `Платеж найден: ${payment.id}, статус: ${payment.status}`,
      );

      // Если платеж еще pending, симулируем успешную оплату (для тестового режима)
      if (payment.status === 'pending') {
        this.logger.log(
          'Платеж в статусе pending, обновляем на paid (тестовый режим)',
        );
        await this.orderPaymentService.updatePaymentStatus(paymentId, 'paid');
        payment.status = 'paid';
      }

      // Перенаправляем на фронтенд с результатом
      const frontendUrl = this.configService.getFrontendUrl();

      if (payment.status === 'paid') {
        this.logger.log(
          `Перенаправляем на фронт с успешным платежом: ${paymentId}`,
        );
        res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&type=order&status=success`,
        );
      } else {
        this.logger.log(
          `Перенаправляем на фронт с неуспешным платежом: ${paymentId}, статус: ${payment.status}`,
        );
        res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&type=order&status=${payment.status}&error=payment_failed`,
        );
      }
    } catch (error) {
      this.logger.error('Ошибка при обработке success страницы:', error);
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?type=order&error=processing_error`,
      );
      return;
    }
  }

  @Get(':paymentId')
  async getPaymentForm(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const payment =
        await this.orderPaymentService.checkPaymentStatus(paymentId);

      if (!payment) {
        res.status(404).send('Платеж не найден');
        return;
      }

      // Читаем HTML шаблон
      const templatePath = join(
        process.cwd(),
        'src',
        'order',
        'templates',
        'order-payment-form.html',
      );
      let html = readFileSync(templatePath, 'utf8');

      // Конвертируем сумму из копеек в рубли для отображения
      const amountInRubles = (payment.amount / 100).toFixed(0);
      const amountInKopecks = payment.amount.toString();

      // Заменяем плейсхолдеры
      html = html.replace(/{{paymentId}}/g, payment.id);
      html = html.replace(/{{amount}}/g, amountInRubles);
      html = html.replace(/{{amountKopecks}}/g, amountInKopecks);
      html = html.replace(/{{paymentUrl}}/g, payment.paymentUrl || '#');
      html = html.replace(/{{status}}/g, payment.status);
      html = html.replace(
        /{{WEBSOCKET_URL}}/g,
        this.configService.getWebSocketUrl(),
      );

      res.send(html);
    } catch (error) {
      this.logger.error('Ошибка загрузки формы оплаты:', error);
      res.status(500).send(`Ошибка загрузки формы оплаты: ${error.message}`);
    }
  }
}
