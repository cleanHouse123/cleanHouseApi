import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeUserRoleToRoles1769685757000
  implements MigrationInterface
{
  name = 'ChangeUserRoleToRoles1769685757000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Создаем новую колонку roles как массив enum
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN "roles" "user_role_enum"[]
      DEFAULT ARRAY[]::"user_role_enum"[]
    `);

    // Копируем данные из role в roles (каждое значение становится массивом с одним элементом)
    await queryRunner.query(`
      UPDATE "user"
      SET "roles" = ARRAY["role"]::"user_role_enum"[]
      WHERE "role" IS NOT NULL
    `);

    // Удаляем старую колонку role
    await queryRunner.query(`
      ALTER TABLE "user"
      DROP COLUMN "role"
    `);

    // Добавляем комментарий
    await queryRunner.query(`
      COMMENT ON COLUMN "user"."roles"
      IS 'Массив ролей пользователя (admin, customer, currier)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Создаем обратно колонку role
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN "role" "user_role_enum"
    `);

    // Копируем первую роль из массива roles обратно в role
    await queryRunner.query(`
      UPDATE "user"
      SET "role" = "roles"[1]
      WHERE array_length("roles", 1) > 0
    `);

    // Удаляем колонку roles
    await queryRunner.query(`
      ALTER TABLE "user"
      DROP COLUMN "roles"
    `);
  }
}
