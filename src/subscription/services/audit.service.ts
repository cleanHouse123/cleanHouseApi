import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentAudit,
  PaymentAuditAction,
} from '../entities/payment-audit.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(PaymentAudit)
    private auditRepository: Repository<PaymentAudit>,
  ) {}

  async logPaymentAction(
    action: PaymentAuditAction,
    userId: string,
    data: {
      paymentId?: string;
      subscriptionId?: string;
      amount?: number;
      metadata?: any;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<PaymentAudit> {
    const audit = this.auditRepository.create({
      action,
      userId,
      paymentId: data.paymentId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      metadata: data.metadata,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    return await this.auditRepository.save(audit);
  }

  async getPaymentAuditHistory(paymentId: string): Promise<PaymentAudit[]> {
    return await this.auditRepository.find({
      where: { paymentId },
      order: { createdAt: 'ASC' },
    });
  }

  async getUserAuditHistory(
    userId: string,
    limit = 50,
  ): Promise<PaymentAudit[]> {
    return await this.auditRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
