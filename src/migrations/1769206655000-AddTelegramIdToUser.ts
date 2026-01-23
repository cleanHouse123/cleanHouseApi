import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramIdToUser1769206655000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем, существует ли уже колонка telegramId
    const table = await queryRunner.getTable('user');
    const column = table?.findColumnByName('telegramId');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "user" 
        ADD COLUMN "telegramId" VARCHAR UNIQUE
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" 
      DROP COLUMN "telegramId"
    `);
  }
}
