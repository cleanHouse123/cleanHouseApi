import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Пункт 6.2 — цена пакета, чтобы удерживать её из возврата.
 * Пункт 6.4 — заморозка подписки: статус и срок паузы.
 */
export class AddBagPriceAndFreeze1792900000000 implements MigrationInterface {
  name = 'AddBagPriceAndFreeze1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "bagPriceInKopecks" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "bagPriceInKopecks" integer NOT NULL DEFAULT 0`,
    );

    // статус заморозки добавляем в существующий enum
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."subscription_status_enum" ADD VALUE IF NOT EXISTS 'frozen';
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "frozenUntil" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "freezeDaysUsed" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "freezeDaysUsed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "frozenUntil"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "bagPriceInKopecks"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "bagPriceInKopecks"`,
    );
    // значение enum в PostgreSQL не удаляется — статус 'frozen' остаётся
  }
}
