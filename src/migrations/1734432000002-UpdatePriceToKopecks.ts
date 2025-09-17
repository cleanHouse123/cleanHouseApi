import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePriceToKopecks1734432000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Проверяем и добавляем новую колонку priceInKopecks только если её нет
    const hasColumn = await queryRunner.hasColumn(
      'subscription_plans',
      'priceInKopecks',
    );
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        ADD COLUMN "priceInKopecks" integer;
      `);
    }

    // 2. Конвертируем существующие данные из рублей в копейки (только если колонка price существует)
    const hasPriceColumn = await queryRunner.hasColumn(
      'subscription_plans',
      'price',
    );
    if (hasPriceColumn) {
      await queryRunner.query(`
        UPDATE subscription_plans 
        SET "priceInKopecks" = ROUND(price * 100)
        WHERE price IS NOT NULL;
      `);

      // 3. Делаем новую колонку обязательной
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        ALTER COLUMN "priceInKopecks" SET NOT NULL;
      `);

      // 4. Удаляем старую колонку price
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        DROP COLUMN price;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Добавляем обратно колонку price (только если её нет)
    const hasPriceColumn = await queryRunner.hasColumn(
      'subscription_plans',
      'price',
    );
    if (!hasPriceColumn) {
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        ADD COLUMN price decimal(10,2);
      `);
    }

    // 2. Конвертируем обратно из копеек в рубли
    const hasPriceInKopecksColumn = await queryRunner.hasColumn(
      'subscription_plans',
      'priceInKopecks',
    );
    if (hasPriceInKopecksColumn) {
      await queryRunner.query(`
        UPDATE subscription_plans 
        SET price = "priceInKopecks" / 100.0
        WHERE "priceInKopecks" IS NOT NULL;
      `);

      // 3. Делаем колонку price обязательной
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        ALTER COLUMN price SET NOT NULL;
      `);

      // 4. Удаляем колонку priceInKopecks
      await queryRunner.query(`
        ALTER TABLE subscription_plans 
        DROP COLUMN "priceInKopecks";
      `);
    }
  }
}
