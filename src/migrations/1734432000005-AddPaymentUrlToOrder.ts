import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentUrlToOrder1734432000005 implements MigrationInterface {
  name = 'AddPaymentUrlToOrder1734432000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем, существует ли уже колонка paymentUrl
    const table = await queryRunner.getTable('order');
    const paymentUrlColumn = table?.findColumnByName('paymentUrl');

    if (!paymentUrlColumn) {
      await queryRunner.query(`ALTER TABLE "order" ADD "paymentUrl" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "paymentUrl"`);
  }
}
