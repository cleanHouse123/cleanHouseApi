import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentRefundFields1792710000000 implements MigrationInterface {
  name = 'AddPaymentRefundFields1792710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_refundstatus_enum" AS ENUM('none', 'pending', 'succeeded', 'canceled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundStatus" "public"."payment_refundstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundAmount" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundReason" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundDecidedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "refundDecidedBy" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'refundDecidedBy',
      'refundDecidedAt',
      'refundReason',
      'refundId',
      'refundAmount',
      'refundStatus',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "payment" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."payment_refundstatus_enum"`,
    );
  }
}
