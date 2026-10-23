import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Привязка расписания к сохранённому адресу клиента. Раньше адрес хранился
 * только текстом, поэтому у заказов по расписанию не было `addressId`.
 */
export class AddScheduledOrderAddressId1792780000000
  implements MigrationInterface
{
  name = 'AddScheduledOrderAddressId1792780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduled_orders" ADD COLUMN IF NOT EXISTS "addressId" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduled_orders" DROP COLUMN IF EXISTS "addressId"`,
    );
  }
}
