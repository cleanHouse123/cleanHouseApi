import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Отметка о том, что курьерам уже сообщили об оплате заказа. YooKassa
 * повторяет уведомление, и без отметки курьер получал пуш на каждую
 * доставку — по одному и тому же заказу.
 */
export class AddOrderCouriersNotifiedAt1793000000000
  implements MigrationInterface
{
  name = 'AddOrderCouriersNotifiedAt1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "couriersNotifiedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "couriersNotifiedAt"`,
    );
  }
}
