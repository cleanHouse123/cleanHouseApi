import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssignedAtAndOverdueMinutesToOrder1737721300000
  implements MigrationInterface
{
  name = 'AddAssignedAtAndOverdueMinutesToOrder1737721300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Добавляем поле assignedAt
    await queryRunner.query(`
      ALTER TABLE "order"
      ADD COLUMN "assignedAt" TIMESTAMP WITH TIME ZONE
    `);

    // Добавляем поле overdueMinutes
    await queryRunner.query(`
      ALTER TABLE "order"
      ADD COLUMN "overdueMinutes" INTEGER
    `);

    // Добавляем индекс на assignedAt для быстрой сортировки
    await queryRunner.query(`
      CREATE INDEX "IDX_order_assignedAt"
      ON "order" ("assignedAt")
    `);

    // Добавляем комментарии
    await queryRunner.query(`
      COMMENT ON COLUMN "order"."assignedAt"
      IS 'Время назначения курьера на заказ'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "order"."overdueMinutes"
      IS 'Количество минут просрочки (сохраняется при изменении статуса)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем индекс
    await queryRunner.query(`DROP INDEX "IDX_order_assignedAt"`);

    // Удаляем поля
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "overdueMinutes"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "assignedAt"`);
  }
}
