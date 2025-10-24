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
import { PaymentService } from '../services/payment.service';
import { SharedConfigService } from '../../shared/services/config.service';

@Controller('subscription-payment')
export class SubscriptionPaymentPageController {
  private readonly logger = new Logger(SubscriptionPaymentPageController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: SharedConfigService,
  ) {}

  @Get('yookassa-return')
  async handleYookassaReturn(@Query() query: any, @Res() res: Response) {
    try {
      this.logger.log(
        `Обработка возврата с YooKassa для подписки. Query params:`,
        query,
      );

      // Получаем orderId из query параметров (это YooKassa ID)
      const yookassaOrderId = query.orderId || query.orderid || query.order_id;

      if (!yookassaOrderId) {
        this.logger.error(
          'orderId не найден в query параметрах для подписки:',
          query,
        );

        // Показываем страницу с инструкциями для пользователя
        const frontendUrl = this.configService.getFrontendUrl();
        const instructionsHtml = `
          <!DOCTYPE html>
          <html lang="ru">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Завершение оплаты подписки</title>
              <style>
                  body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      margin: 0;
                      padding: 20px;
                      min-height: 100vh;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                  }
                  .container {
                      background: white;
                      border-radius: 20px;
                      padding: 40px;
                      text-align: center;
                      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                      max-width: 500px;
                      width: 100%;
                  }
                  .icon {
                      font-size: 64px;
                      margin-bottom: 20px;
                  }
                  h1 {
                      color: #333;
                      margin-bottom: 20px;
                  }
                  p {
                      color: #666;
                      line-height: 1.6;
                      margin-bottom: 20px;
                  }
                  .btn {
                      display: inline-block;
                      padding: 15px 30px;
                      background: #007bff;
                      color: white;
                      text-decoration: none;
                      border-radius: 10px;
                      font-size: 16px;
                      margin: 10px;
                      transition: background-color 0.3s;
                  }
                  .btn:hover {
                      background: #0056b3;
                  }
              </style>
          </head>
          <body>
              <div class="container">
                  <div class="icon">🔄</div>
                  <h1>Оплата подписки завершена</h1>
                  <p>Если оплата прошла успешно, нажмите кнопку ниже, чтобы вернуться в приложение:</p>
                  
                  <a href="${frontendUrl}/payment-return?type=subscription" class="btn" id="returnBtn">
                      Вернуться в приложение
                  </a>
                  
                  <p style="margin-top: 30px; font-size: 14px; color: #999;">
                      Если у вас возникли проблемы, обратитесь в службу поддержки
                  </p>
                  
                  <script>
                    // Пытаемся извлечь orderId из referrer URL
                    function extractOrderIdFromReferrer() {
                      const referrer = document.referrer;
                      console.log('Referrer:', referrer);
                      
                      if (referrer && referrer.includes('yoomoney.ru')) {
                        const match = referrer.match(/orderId=([^&]+)/);
                        if (match) {
                          const orderId = match[1];
                          console.log('Найден orderId в referrer для подписки:', orderId);
                          
                          // Перенаправляем на наш endpoint с orderId
                          window.location.href = '/subscription-payment/yookassa-return?orderId=' + orderId;
                          return true;
                        }
                      }
                      return false;
                    }
                    
                    // Пытаемся автоматически обработать платеж
                    if (!extractOrderIdFromReferrer()) {
                      console.log('OrderId не найден в referrer для подписки, показываем кнопку возврата');
                      
                      // Альтернативный способ - проверяем последний платеж из sessionStorage
                      const pendingPaymentId = sessionStorage?.getItem('pendingPaymentId');
                      if (pendingPaymentId) {
                        console.log('Найден pendingPaymentId для подписки:', pendingPaymentId);
                        // Перенаправляем на success страницу с нашим paymentId
                        window.location.href = '/subscription-payment/success/' + pendingPaymentId;
                      }
                    }
                  </script>
              </div>
          </body>
          </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(instructionsHtml);
        return;
      }

      this.logger.log(
        `Найден YooKassa orderId для подписки: ${yookassaOrderId}`,
      );

      // Ищем платеж по yookassaId
      const payment =
        await this.paymentService.findByYookassaId(yookassaOrderId);

      if (!payment) {
        this.logger.error(
          `Платеж подписки с yookassaId ${yookassaOrderId} не найден`,
        );
        const frontendUrl = this.configService.getFrontendUrl();
        return res.redirect(
          `${frontendUrl}/payment-return?type=subscription&error=payment_not_found`,
        );
      }

      this.logger.log(`Найден платеж подписки: ${payment.id}`);

      // Перенаправляем на наш стандартный success endpoint
      return res.redirect(`/subscription-payment/success/${payment.id}`);
    } catch (error) {
      this.logger.error(
        `Ошибка обработки возврата с YooKassa для подписки:`,
        error,
      );

      // В случае ошибки перенаправляем на фронтенд с ошибкой
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?type=subscription&error=yookassa_return_error`,
      );
    }
  }

  @Get('success/:paymentId')
  async showSuccessPage(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(
        `Обработка успешной оплаты подписки для paymentId: ${paymentId}`,
      );

      // Проверяем существование платежа
      const payment = await this.paymentService.getPayment(paymentId);

      if (!payment) {
        // Если платеж не найден, все равно перенаправляем на фронтенд с ошибкой
        const frontendUrl = this.configService.getFrontendUrl();
        return res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&type=subscription&error=not_found`,
        );
      }

      // Автоматически обновляем статус платежа на успешный
      if (payment.status === 'pending') {
        await this.paymentService.simulateSuccessfulPayment(paymentId);
        this.logger.log(
          `Платеж подписки ${paymentId} автоматически помечен как успешный`,
        );
      }

      // Перенаправляем на фронтенд
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?paymentId=${paymentId}&type=subscription`,
      );
    } catch (error) {
      this.logger.error(
        `Ошибка обработки успешной оплаты подписки для paymentId: ${paymentId}`,
        error,
      );

      // В случае ошибки тоже перенаправляем на фронтенд
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?paymentId=${paymentId}&type=subscription&error=processing_error`,
      );
    }
  }
}
