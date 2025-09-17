import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSubscriptionPlans1734432000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO subscription_plans (
        id, type, name, description, "priceInKopecks", duration, features, icon, "badgeColor", popular
      ) VALUES 
      (
        uuid_generate_v4(),
        'monthly',
        'Месячная подписка',
        'Подписка на месяц с доступом ко всем функциям',
        100000,
        '1 месяц',
        'Неограниченное количество заказов,Приоритетная поддержка,Уведомления в реальном времени,История заказов',
        'calendar',
        'blue',
        false
      ),
      (
        uuid_generate_v4(),
        'yearly',
        'Годовая подписка',
        'Подписка на год со скидкой 20%',
        960000,
        '12 месяцев',
        'Неограниченное количество заказов,Приоритетная поддержка,Уведомления в реальном времени,История заказов,Эксклюзивные функции,Скидка 20%',
        'zap',
        'purple',
        true
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM subscription_plans WHERE type IN ('monthly', 'yearly');
    `);
  }
}
