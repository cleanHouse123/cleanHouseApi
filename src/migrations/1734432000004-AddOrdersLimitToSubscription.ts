import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdersLimitToSubscription1734432000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscription 
      ADD COLUMN "ordersLimit" INTEGER DEFAULT -1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscription 
      DROP COLUMN "ordersLimit"
    `);
  }
}
