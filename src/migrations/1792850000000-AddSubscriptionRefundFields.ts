import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Решение по возврату при отказе от подписки, пункт 6.7 Оферты.
 * Поля повторяют те, что уже есть у платежей по заказам.
 */
export class AddSubscriptionRefundFields1792850000000
  implements MigrationInterface
{
  name = 'AddSubscriptionRefundFields1792850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_refundstatus_enum" AS ENUM('none', 'pending', 'succeeded', 'canceled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundStatus" "public"."payment_refundstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundAmount" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundReason" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundDecidedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "refundDecidedBy" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'refundStatus',
      'refundAmount',
      'refundId',
      'refundReason',
      'refundDecidedAt',
      'refundDecidedBy',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}
