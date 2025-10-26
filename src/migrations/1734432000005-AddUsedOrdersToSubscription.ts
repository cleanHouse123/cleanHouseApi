import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsedOrdersToSubscription1734432000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscription 
      ADD COLUMN "usedOrders" INTEGER DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscription 
      DROP COLUMN "usedOrders"
    `);
  }
}
