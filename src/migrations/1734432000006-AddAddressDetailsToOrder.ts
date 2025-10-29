import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressDetailsToOrder1734432000006
  implements MigrationInterface
{
  name = 'AddAddressDetailsToOrder1734432000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем, существует ли уже колонка addressDetails
    const table = await queryRunner.getTable('order');
    const addressDetailsColumn = table?.findColumnByName('addressDetails');

    if (!addressDetailsColumn) {
      await queryRunner.query(`ALTER TABLE "order" ADD "addressDetails" jsonb`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "addressDetails"`);
  }
}
