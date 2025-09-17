import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSubscriptionPlansTable1734432000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'subscription_plans',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'priceInKopecks',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'duration',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'features',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'icon',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'badgeColor',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'popular',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('subscription_plans');
  }
}
