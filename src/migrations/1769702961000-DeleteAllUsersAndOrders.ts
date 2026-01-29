import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteAllUsersAndOrders1769702961000
  implements MigrationInterface
{
  name = 'DeleteAllUsersAndOrders1769702961000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Удаляем все отзывы (reviews) - они связаны с заказами и пользователями
    await queryRunner.query(`DELETE FROM "review"`);

    // Удаляем все платежи (payments) - они связаны с заказами
    await queryRunner.query(`DELETE FROM "payment"`);

    // Удаляем все заказы (orders)
    await queryRunner.query(`DELETE FROM "order"`);

    // Удаляем запланированные заказы (scheduled_orders) - они связаны с пользователями
    await queryRunner.query(`DELETE FROM "scheduled_orders"`);

    // Удаляем подписки (subscriptions) - они связаны с пользователями
    await queryRunner.query(`DELETE FROM "subscription"`);

    // Удаляем адреса пользователей (user_address) - они связаны с пользователями
    await queryRunner.query(`DELETE FROM "user_address"`);

    // Удаляем всех пользователей (user)
    await queryRunner.query(`DELETE FROM "user"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат не требуется, так как это полное удаление данных
    // Можно оставить пустым
  }
}
