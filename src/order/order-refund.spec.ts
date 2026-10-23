import { BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderStatus } from './entities/order.entity';
import { PaymentStatus, RefundStatus } from './entities/payment.entity';
import { RefundDecision } from './dto/cancel-with-refund.dto';

/**
 * Отмена оплаченного заказа с решением по деньгам.
 *
 * Отдельно закрываем единицы измерения: `payment.amount` хранится в копейках,
 * как и `order.price`. Из-за колонки decimal(10,2) это неочевидно — на проде
 * оплата 199 ₽ показалась как «19900 ₽», и возврат ушёл бы в сто раз больше.
 */
describe('OrderService.cancelWithRefund — суммы', () => {
  const buildService = (paymentOverrides: Record<string, unknown> = {}) => {
    const order = {
      id: 'order-1',
      status: OrderStatus.PAID,
      customerId: 'user-1',
    };
    const payment: Record<string, unknown> = {
      id: 'pay-1',
      orderId: 'order-1',
      amount: 19900, // 199 ₽ в копейках
      status: PaymentStatus.PAID,
      yookassaId: 'yk-1',
      ...paymentOverrides,
    };

    const orderRepository = { findOne: jest.fn().mockResolvedValue(order) };
    const paymentRepository = {
      findOne: jest.fn().mockResolvedValue(payment),
      save: jest.fn(async (value: unknown) => value),
    };
    const refundService = {
      createRefund: jest.fn().mockResolvedValue({
        id: 'rf-1',
        status: 'succeeded',
        amountInKopecks: 19900,
      }),
    };

    const service = Object.create(OrderService.prototype) as OrderService;
    Object.assign(service, {
      orderRepository,
      paymentRepository,
      refundService,
      updateStatus: jest.fn().mockResolvedValue({ id: 'order-1' }),
    });

    return { service, payment, paymentRepository, refundService };
  };

  it('полный возврат уходит на сумму платежа в копейках', async () => {
    const { service, refundService, payment } = buildService();

    await service.cancelWithRefund(
      'order-1',
      { refund: RefundDecision.FULL },
      'admin-1',
    );

    expect(refundService.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        yookassaPaymentId: 'yk-1',
        amountInKopecks: 19900,
      }),
    );
    expect(payment.refundAmount).toBe(19900);
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
  });

  it('частичный возврат переводит рубли из формы в копейки', async () => {
    const { service, refundService, payment } = buildService();

    await service.cancelWithRefund(
      'order-1',
      { refund: RefundDecision.PARTIAL, amount: 150.5 },
      'admin-1',
    );

    expect(refundService.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountInKopecks: 15050 }),
    );
    // возврат неполный, платёж остаётся оплаченным
    expect(payment.status).toBe(PaymentStatus.PAID);
  });

  it('не даёт вернуть больше, чем заплатили', async () => {
    const { service, refundService } = buildService();

    await expect(
      service.cancelWithRefund(
        'order-1',
        { refund: RefundDecision.PARTIAL, amount: 500 },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refundService.createRefund).not.toHaveBeenCalled();
  });

  it('отказ в возврате требует причину', async () => {
    const { service, refundService } = buildService();

    await expect(
      service.cancelWithRefund(
        'order-1',
        { refund: RefundDecision.NONE },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refundService.createRefund).not.toHaveBeenCalled();
  });

  it('отказ с причиной сохраняется без обращения в YooKassa', async () => {
    const { service, refundService, payment } = buildService();

    await service.cancelWithRefund(
      'order-1',
      { refund: RefundDecision.NONE, reason: 'Пакет не выставлен' },
      'admin-1',
    );

    expect(refundService.createRefund).not.toHaveBeenCalled();
    expect(payment.refundStatus).toBe(RefundStatus.NONE);
    expect(payment.refundReason).toBe('Пакет не выставлен');
  });

  it('заказ по подписке отменяется без возврата', async () => {
    const { service, refundService } = buildService({ yookassaId: null });

    await service.cancelWithRefund(
      'order-1',
      { refund: RefundDecision.FULL },
      'admin-1',
    );

    expect(refundService.createRefund).not.toHaveBeenCalled();
  });
});
