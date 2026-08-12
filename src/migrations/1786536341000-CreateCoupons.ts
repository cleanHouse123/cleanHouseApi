import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoupons1786536341000 implements MigrationInterface {
  name = 'CreateCoupons1786536341000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupons_scope_enum" AS ENUM('subscription', 'order', 'both')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupons_discounttype_enum" AS ENUM('percent', 'fixed_amount', 'final_price')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "description" character varying,
        "scope" "public"."coupons_scope_enum" NOT NULL,
        "discountType" "public"."coupons_discounttype_enum" NOT NULL,
        "value" integer NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "startsAt" TIMESTAMP,
        "endsAt" TIMESTAMP,
        "maxRedemptions" integer,
        "redeemedCount" integer NOT NULL DEFAULT 0,
        "minAmount" integer,
        "subscriptionPlanId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupons_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_coupons_code" ON "coupons" ("code")`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."coupon_redemptions_status_enum" AS ENUM('reserved', 'confirmed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_redemptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "couponId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "status" "public"."coupon_redemptions_status_enum" NOT NULL,
        "orderId" uuid,
        "subscriptionId" uuid,
        "amountBefore" integer NOT NULL,
        "amountAfter" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_redemptions_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_redemptions_couponId" ON "coupon_redemptions" ("couponId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_redemptions_userId" ON "coupon_redemptions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_coupon_redemptions_coupon_user" ON "coupon_redemptions" ("couponId", "userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_coupon_redemptions_coupon_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_coupon_redemptions_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_coupon_redemptions_couponId"`,
    );
    await queryRunner.query(`DROP TABLE "coupon_redemptions"`);
    await queryRunner.query(
      `DROP TYPE "public"."coupon_redemptions_status_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_coupons_code"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_discounttype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_scope_enum"`);
  }
}
