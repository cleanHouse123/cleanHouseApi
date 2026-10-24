import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Запоминаем, из какой подписки списан вынос: при отмене заказа вынос должен
 * вернуться именно в неё, а не в ту, которая активна на момент отмены.
 */
export class AddPaymentSubscriptionId1792950000000
  implements MigrationInterface
{
  name = 'AddPaymentSubscriptionId1792950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "subscriptionId" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" DROP COLUMN IF EXISTS "subscriptionId"`,
    );
  }
}
