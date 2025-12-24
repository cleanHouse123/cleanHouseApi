import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsageFeaturesToUserAddress1766497597000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Создаем enum тип для признаков адреса
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "address_usage_feature_enum" AS ENUM ('FIRST_ORDER_USED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Добавляем колонку usageFeatures
    const table = await queryRunner.getTable('user-address');
    const column = table?.findColumnByName('usageFeatures');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "user-address" 
        ADD COLUMN "usageFeatures" "address_usage_feature_enum"[] DEFAULT '{}'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user-address" 
      DROP COLUMN "usageFeatures"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "address_usage_feature_enum"
    `);
  }
}

