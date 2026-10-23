import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Отметка об отправленном push о просрочке. Раньше список уведомлённых
 * заказов жил в памяти процесса, поэтому после каждого выката курьеры
 * получали уведомления заново по всем старым просроченным заказам.
 */
export class AddOrderOverdueNotifiedAt1792760000000
  implements MigrationInterface
{
  name = 'AddOrderOverdueNotifiedAt1792760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "overdueNotifiedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "overdueNotifiedAt"`,
    );
  }
}
