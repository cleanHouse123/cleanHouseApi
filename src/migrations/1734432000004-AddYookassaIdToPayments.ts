import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYookassaIdToPayments1734432000004
  implements MigrationInterface
{
  name = 'AddYookassaIdToPayments1734432000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Проверяем и добавляем поле yookassaId в таблицу payment, если его нет
    const paymentTable = await queryRunner.getTable('payment');
    const paymentYookassaIdColumn =
      paymentTable?.findColumnByName('yookassaId');

    if (!paymentYookassaIdColumn) {
      await queryRunner.query(
        `ALTER TABLE "payment" ADD "yookassaId" character varying`,
      );
    }

    // Проверяем и добавляем поле yookassaId в таблицу subscription_payments, если его нет
    const subscriptionPaymentsTable = await queryRunner.getTable(
      'subscription_payments',
    );
    const subscriptionYookassaIdColumn =
      subscriptionPaymentsTable?.findColumnByName('yookassaId');

    if (!subscriptionYookassaIdColumn) {
      await queryRunner.query(
        `ALTER TABLE "subscription_payments" ADD "yookassaId" character varying`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP COLUMN "yookassaId"`,
    );
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "yookassaId"`);
  }
}
