import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixEmptyRolesForExistingUsers1769702453000
  implements MigrationInterface
{
  name = 'FixEmptyRolesForExistingUsers1769702453000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Обновляем роли для пользователей, у которых roles пустой массив
    // Определяем роль на основе их участия в заказах

    // Обновляем роли одним запросом, определяя их на основе участия в заказах
    await queryRunner.query(`
      UPDATE "user"
      SET "roles" = (
        SELECT ARRAY_AGG(DISTINCT role_value)::"user_role_enum"[]
        FROM (
          SELECT 'currier'::"user_role_enum" as role_value
          WHERE EXISTS (
            SELECT 1 FROM "order" WHERE "order"."currierId" = "user"."id"
          )
          UNION
          SELECT 'customer'::"user_role_enum" as role_value
          WHERE EXISTS (
            SELECT 1 FROM "order" WHERE "order"."customerId" = "user"."id"
          )
        ) roles_list
      )
      WHERE 
        (array_length("roles", 1) IS NULL OR array_length("roles", 1) = 0)
        AND (
          EXISTS (SELECT 1 FROM "order" WHERE "order"."currierId" = "user"."id")
          OR EXISTS (SELECT 1 FROM "order" WHERE "order"."customerId" = "user"."id")
        )
    `);

    // Для остальных пользователей без ролей устанавливаем CUSTOMER по умолчанию
    await queryRunner.query(`
      UPDATE "user"
      SET "roles" = ARRAY['customer']::"user_role_enum"[]
      WHERE 
        array_length("roles", 1) IS NULL 
        OR array_length("roles", 1) = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат не требуется, так как это исправление данных
    // Можно оставить пустым или сбросить roles в пустой массив для всех пользователей
    // Но это не рекомендуется, так как потеряет данные
  }
}
