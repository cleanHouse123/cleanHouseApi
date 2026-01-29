import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteAllOrdersForce1769705100000 implements MigrationInterface {
  name = 'DeleteAllOrdersForce1769705100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Удаляем все отзывы (reviews) - они связаны с заказами
    await queryRunner.query(`DELETE FROM "review"`);

    // Удаляем все платежи (payments) - они связаны с заказами
    await queryRunner.query(`DELETE FROM "payment"`);

    // Удаляем все заказы (orders) без проверки статуса
    await queryRunner.query(`DELETE FROM "order"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат не требуется, так как это полное удаление данных
  }
}
