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
    try {
      this.logger.log(`Обработка возврата с YooKassa. Query params:`, query);

      // Получаем orderId из query параметров (это YooKassa ID)
      const yookassaOrderId = query.orderId || query.orderid || query.order_id;

      if (!yookassaOrderId) {
        this.logger.error('orderId не найден в query параметрах:', query);

        // Показываем страницу с инструкциями для пользователя
        const frontendUrl = this.configService.getFrontendUrl();
        const instructionsHtml = `
          <!DOCTYPE html>
          <html lang="ru">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Завершение оплаты</title>
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
                  <div class="icon">💳</div>
                  <h1>Оплата завершена</h1>
                  <p>Если оплата прошла успешно, нажмите кнопку ниже, чтобы вернуться в приложение:</p>
                  
                  <div style="margin: 20px 0;">
                    <input type="text" id="orderIdInput" placeholder="Введите orderId из URL YooKassa" 
                           style="padding: 10px; width: 300px; border: 1px solid #ddd; border-radius: 5px; margin-right: 10px;">
                    <button onclick="processManualOrderId()" class="btn" style="display: inline-block; padding: 10px 20px;">
                      Обработать платеж
                    </button>
                  </div>
                  
                  <a href="${frontendUrl}/payment-return" class="btn" id="returnBtn">
                      Вернуться в приложение
                  </a>
                  
                  <p style="margin-top: 30px; font-size: 14px; color: #999;">
                      Если у вас возникли проблемы, обратитесь в службу поддержки
                  </p>
                  
                  <script>
                    console.log('=== Отладка извлечения orderId ===');
                    console.log('Current URL:', window.location.href);
                    console.log('Referrer:', document.referrer);
                    console.log('User Agent:', navigator.userAgent);
                    
                    // Пытаемся извлечь orderId из referrer URL
                    function extractOrderIdFromReferrer() {
                      const referrer = document.referrer;
                      console.log('Проверяем referrer:', referrer);
                      
                      if (referrer) {
                        // Проверяем разные варианты URL YooKassa
                        const patterns = [
                          /orderId=([^&?#]+)/i,
                          /orderid=([^&?#]+)/i,
                          /order_id=([^&?#]+)/i,
                          /contract\?([^&?#]+)/i, // для случая contract?308dd069-000f-5001-9000-1885b0d59941
                          /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i // UUID в пути
                        ];
                        
                        for (let pattern of patterns) {
                          const match = referrer.match(pattern);
                          if (match) {
                            const orderId = match[1];
                            console.log('Найден orderId по паттерну', pattern, ':', orderId);
                            
                            // Проверяем, что это похоже на YooKassa ID
                            if (orderId.length > 10) {
                              console.log('Перенаправляем с orderId:', orderId);
                              window.location.href = '/order-payment/yookassa-return?orderId=' + orderId;
                              return true;
                            }
                          }
                        }
                      }
                      
                      console.log('OrderId не найден в referrer');
                      return false;
                    }
                    
                    // Альтернативный способ - извлечение из истории браузера
                    function extractFromHistory() {
                      try {
                        const historyLength = window.history.length;
                        console.log('History length:', historyLength);
                        
                        // Пытаемся получить предыдущий URL из performance API
                        if (window.performance && window.performance.navigation) {
                          console.log('Navigation type:', window.performance.navigation.type);
                        }
                        
                        // Проверяем performance entries
                        if (window.performance && window.performance.getEntriesByType) {
                          const navigationEntries = window.performance.getEntriesByType('navigation');
                          console.log('Navigation entries:', navigationEntries);
                        }
                      } catch (e) {
                        console.log('Ошибка при работе с историей:', e);
                      }
                    }
                    
                    // Функция для ручной обработки orderId
                    function processManualOrderId() {
                      const input = document.getElementById('orderIdInput');
                      const orderId = input.value.trim();
                      
                      if (!orderId) {
                        alert('Введите orderId');
                        return;
                      }
                      
                      console.log('Ручная обработка orderId:', orderId);
                      window.location.href = '/order-payment/yookassa-return?orderId=' + orderId;
                    }
                    
                    // Обработка Enter в поле ввода
                    document.addEventListener('DOMContentLoaded', function() {
                      const input = document.getElementById('orderIdInput');
                      if (input) {
                        input.addEventListener('keypress', function(e) {
                          if (e.key === 'Enter') {
                            processManualOrderId();
                          }
                        });
                      }
                    });
                    
                    // Пытаемся автоматически обработать платеж
                    setTimeout(() => {
                      console.log('Начинаем обработку возврата...');
                      
                      if (!extractOrderIdFromReferrer()) {
                        console.log('Пробуем альтернативные способы...');
                        extractFromHistory();
                        
                        // Проверяем sessionStorage
                        const pendingPaymentId = sessionStorage?.getItem('pendingPaymentId');
                        if (pendingPaymentId) {
                          console.log('Найден pendingPaymentId:', pendingPaymentId);
                          console.log('Перенаправляем на success страницу...');
                          window.location.href = '/order-payment/success/' + pendingPaymentId;
                          return;
                        }
                        
                        console.log('Показываем кнопку возврата пользователю');
                        // Показываем сообщение пользователю
                        const container = document.querySelector('.container');
                        if (container) {
                          const debugInfo = document.createElement('div');
                          debugInfo.style.marginTop = '20px';
                          debugInfo.style.padding = '10px';
                          debugInfo.style.backgroundColor = '#f0f0f0';
                          debugInfo.style.borderRadius = '5px';
                          debugInfo.style.fontSize = '12px';
                          debugInfo.innerHTML = '<strong>Отладочная информация:</strong><br>' +
                            'Referrer: ' + (document.referrer || 'отсутствует') + '<br>' +
                            'Current URL: ' + window.location.href;
                          container.appendChild(debugInfo);
                        }
                      }
                    }, 1000); // Даем время на загрузку
                  </script>
              </div>
          </body>
          </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(instructionsHtml);
        return;
      }

      this.logger.log(`Найден YooKassa orderId: ${yookassaOrderId}`);

      // Ищем платеж по yookassaId
      const payment =
        await this.orderPaymentService.findByYookassaId(yookassaOrderId);

      if (!payment) {
        this.logger.error(`Платеж с yookassaId ${yookassaOrderId} не найден`);
        const frontendUrl = this.configService.getFrontendUrl();
        return res.redirect(
          `${frontendUrl}/payment-return?error=payment_not_found`,
        );
      }

      this.logger.log(`Найден платеж: ${payment.id}`);

      // Перенаправляем на наш стандартный success endpoint
      return res.redirect(`/order-payment/success/${payment.id}`);
    } catch (error) {
      this.logger.error(`Ошибка обработки возврата с YooKassa:`, error);

      // В случае ошибки перенаправляем на фронтенд с ошибкой
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(`${frontendUrl}/payment-return?error=yookassa_return_error`);
    }
  }

  @Get('success/:paymentId')
  async showSuccessPage(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Обработка успешной оплаты для paymentId: ${paymentId}`);

      // Проверяем существование платежа
      const payment = await this.orderPaymentService.getPayment(paymentId);

      if (!payment) {
        // Если платеж не найден, все равно перенаправляем на фронтенд с ошибкой
        const frontendUrl = this.configService.getFrontendUrl();
        return res.redirect(
          `${frontendUrl}/payment-return?paymentId=${paymentId}&error=not_found`,
        );
      }

      // Автоматически обновляем статус платежа на успешный
      if (payment.status === 'pending') {
        await this.orderPaymentService.simulateSuccessfulPayment(paymentId);
        this.logger.log(
          `Платеж ${paymentId} автоматически помечен как успешный`,
        );
      }

      // Перенаправляем на фронтенд
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(`${frontendUrl}/payment-return?paymentId=${paymentId}`);
    } catch (error) {
      this.logger.error(
        `Ошибка обработки успешной оплаты для paymentId: ${paymentId}`,
        error,
      );

      // В случае ошибки тоже перенаправляем на фронтенд
      const frontendUrl = this.configService.getFrontendUrl();
      res.redirect(
        `${frontendUrl}/payment-return?paymentId=${paymentId}&error=processing_error`,
      );
    }
  }

  @Get(':paymentId')
  async showPaymentForm(
    @Param('paymentId') paymentId: string,
    @Res() res: Response,
  ) {
    try {
      // Проверяем существование платежа
      const payment = await this.orderPaymentService.getPayment(paymentId);

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
        'order',
        'templates',
        'order-payment-form.html',
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

      // Заменяем WebSocket URL
      const wsUrl = this.configService.getWebSocketUrl();
      html = html.replace('{{WEBSOCKET_URL}}', wsUrl);

      // Добавляем ссылку для возврата в приложение
      const frontendUrl = this.configService.getFrontendUrl();
      const returnUrl = `${this.configService.getBaseUrl()}/order-payment/success/${paymentId}`;

      html = html.replace(
        '</body>',
        `
        <div style="margin-top: 20px; padding: 20px; background: #f0f0f0; border-radius: 8px;">
          <h3>После оплаты:</h3>
          <p>Если вас не перенаправило автоматически, нажмите кнопку ниже:</p>
          <a href="${returnUrl}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
            Вернуться в приложение
          </a>
        </div>
        </body>`,
      );

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
