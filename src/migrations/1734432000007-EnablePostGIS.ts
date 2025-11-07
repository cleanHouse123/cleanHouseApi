import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostGIS1734432000007 implements MigrationInterface {
  name = 'EnablePostGIS1734432000007';
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Включаем расширение PostGIS, если оно еще не включено
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Отключаем расширение PostGIS
    // ВНИМАНИЕ: Это может удалить все данные, использующие PostGIS типы
    // Обычно это не рекомендуется делать в production
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
  }
}

