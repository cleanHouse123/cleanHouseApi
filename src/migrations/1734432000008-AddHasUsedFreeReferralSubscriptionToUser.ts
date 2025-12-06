import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasUsedFreeReferralSubscriptionToUser1734432000008
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем, существует ли уже колонка hasUsedFreeReferralSubscription
    const table = await queryRunner.getTable('user');
    const column = table?.findColumnByName('hasUsedFreeReferralSubscription');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "user" 
        ADD COLUMN "hasUsedFreeReferralSubscription" BOOLEAN DEFAULT false
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" 
      DROP COLUMN "hasUsedFreeReferralSubscription"
    `);
  }
}

