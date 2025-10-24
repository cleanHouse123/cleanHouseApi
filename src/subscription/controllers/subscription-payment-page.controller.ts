import { Controller, Get, Param, Query, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { SharedConfigService } from '../../shared/services/config.service';
import { SubscriptionPaymentStatus } from '../entities/subscription-payment.entity';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller('subscription-payment')
export class SubscriptionPaymentPageController {
  private readonly logger = new Logger(SubscriptionPaymentPageController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: SharedConfigService,
  ) {}

  @Get('yookassa-return')
  async handleYookassaReturn(@Query() query: any, @Res() res: Response) {
    this.logger.log('Возврат с YooKassa (подписка). Query params:', query);

    const frontendUrl = this.configService.getFrontendUrl();

    // Простая страница с автоматическим редиректом на фронт
    // Статус платежа обновляется через webhook'и
    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Обработка платежа подписки</title>
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
          <div class="success-icon">💳</div>
          <h1>Платеж за подписку обрабатывается</h1>
          <div class="spinner"></div>
          <p>Ваш платеж за подписку обрабатывается. Вы будете автоматически перенаправлены в приложение через несколько секунд.</p>
          <p><small>Статус платежа обновляется через webhook'и от YooKassa</small></p>
          
          <a href="${frontendUrl}" class="return-button">
            🏠 Вернуться в приложение сейчас
          </a>
        </div>

        <script>
          console.log('Возврат с YooKassa (подписка), автоматическое перенаправление через 3 секунды');
          
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
      this.logger.log(
        `Показываем success страницу для платежа подписки: ${paymentId}`,
      );

      // Получаем информацию о платеже
      const payment = await this.paymentService.checkPaymentStatus(paymentId);

      if (!payment) {
        this.logger.error(`Платеж подписки ${paymentId} не найден`);
        const frontendUrl = this.configService.getFrontendUrl();
        res.redirect(
          `${frontendUrl}/payment-return?type=subscription&error=payment_not_found`,
        );
        return;
      }

      this.logger.log(
        `Платеж подписки найден: ${payment.id}, статус: ${payment.status}`,
      );

      // Если платеж еще pending, симулируем успешную оплату (для тестового режима)
      if (payment.status === SubscriptionPaymentStatus.PENDING) {
        this.logger.log(
          'Платеж подписки в статусе pending, обновляем на success (тестовый режим)',
        );
        await this.paymentService.updatePaymentStatus(
          paymentId,
          SubscriptionPaymentStatus.SUCCESS,
        );
        payment.status = SubscriptionPaymentStatus.SUCCESS;
      }

      // Перенаправляем на фронтенд с результатом
      const frontendUrl = this.configService.getFrontendUrl();

      if (payment.status === SubscriptionPaymentStatus.SUCCESS) {
        this.logger.log(
          `Перенаправляем на фронт с успешным платежом подписки: ${paymentId}`,
        );
        res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&type=subscription&status=success`,
        );
      } else {
        this.logger.log(
          `Перенаправляем на фронт с неуспешным платежом подписки: ${paymentId}, статус: ${payment.status}`,
        );
        res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&type=subscription&status=${payment.status}&error=payment_failed`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Ошибка при обработке success страницы подписки:',
        error,
      );
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?type=subscription&error=processing_error`,
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
      const payment = await this.paymentService.checkPaymentStatus(paymentId);

      if (!payment) {
        res.status(404).send('Платеж подписки не найден');
        return;
      }

      // Читаем HTML шаблон для подписки
      const templatePath = join(
        process.cwd(),
        'src',
        'subscription',
        'templates',
        'subscription-payment-form.html',
      );
      let html = readFileSync(templatePath, 'utf8');

      // Заменяем плейсхолдеры
      html = html.replace(/{{paymentId}}/g, payment.id);
      html = html.replace(/{{amount}}/g, payment.amount.toString());
      html = html.replace(/{{paymentUrl}}/g, payment.paymentUrl || '#');
      html = html.replace(/{{status}}/g, payment.status);

      res.send(html);
    } catch (error) {
      this.logger.error('Ошибка загрузки формы оплаты подписки:', error);
      res
        .status(500)
        .send(`Ошибка загрузки формы оплаты подписки: ${error.message}`);
    }
  }
}
