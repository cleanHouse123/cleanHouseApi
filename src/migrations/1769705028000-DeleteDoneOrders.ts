import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteDoneOrders1769705028000 implements MigrationInterface {
  name = 'DeleteDoneOrders1769705028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Удаляем отзывы для завершенных заказов
    await queryRunner.query(`
      DELETE FROM "review" 
      WHERE "orderId" IN (
        SELECT id FROM "order" WHERE status = 'done'
      )
    `);

    // Удаляем платежи для завершенных заказов
    await queryRunner.query(`
      DELETE FROM "payment" 
      WHERE "orderId" IN (
        SELECT id FROM "order" WHERE status = 'done'
      )
    `);

    // Удаляем завершенные заказы
    await queryRunner.query(`DELETE FROM "order" WHERE status = 'done'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат не требуется, так как это удаление данных
  }
}
