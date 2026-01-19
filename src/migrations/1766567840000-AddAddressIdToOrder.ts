import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressIdToOrder1766567840000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Добавляем колонку addressId в таблицу order
    const table = await queryRunner.getTable('order');
    const column = table?.findColumnByName('addressId');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "order" 
        ADD COLUMN "addressId" uuid
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order" 
      DROP COLUMN "addressId"
    `);
  }
}

