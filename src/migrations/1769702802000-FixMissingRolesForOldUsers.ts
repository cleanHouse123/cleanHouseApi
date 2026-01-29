import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMissingRolesForOldUsers1769702802000
  implements MigrationInterface
{
  name = 'FixMissingRolesForOldUsers1769702802000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем, существует ли еще колонка role (на случай если миграция не выполнилась)
    const hasRoleColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'role'
    `);

    // Если колонка role еще существует, переносим данные из неё в roles
    if (hasRoleColumn && hasRoleColumn.length > 0) {
      await queryRunner.query(`
        UPDATE "user"
        SET "roles" = ARRAY["role"]::"user_role_enum"[]
        WHERE "role" IS NOT NULL 
          AND (array_length("roles", 1) IS NULL OR array_length("roles", 1) = 0)
      `);
    }

    // Обновляем роли для пользователей, у которых roles пустой массив
    // Определяем роль на основе их участия в заказах как курьера
    await queryRunner.query(`
      UPDATE "user"
      SET "roles" = ARRAY['currier']::"user_role_enum"[]
      WHERE 
        (array_length("roles", 1) IS NULL OR array_length("roles", 1) = 0)
        AND EXISTS (
          SELECT 1 FROM "order" 
          WHERE "order"."currierId" = "user"."id"
        )
    `);

    // Обновляем роли для пользователей, которые являются клиентами
    // Добавляем роль customer, если её еще нет
    await queryRunner.query(`
      UPDATE "user"
      SET "roles" = CASE 
        WHEN array_length("roles", 1) IS NULL OR array_length("roles", 1) = 0 
        THEN ARRAY['customer']::"user_role_enum"[]
        WHEN NOT ('customer' = ANY("roles"))
        THEN array_append("roles", 'customer'::"user_role_enum")
        ELSE "roles"
      END
      WHERE EXISTS (
        SELECT 1 FROM "order" 
        WHERE "order"."customerId" = "user"."id"
      )
    `);

    // Для всех остальных пользователей без ролей устанавливаем CUSTOMER по умолчанию
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
    // Можно оставить пустым
  }
}
