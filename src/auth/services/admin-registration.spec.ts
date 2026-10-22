import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

/**
 * Регистрация через email выдаёт роль ADMIN, а эндпоинт публичный,
 * поэтому она должна быть закрыта, пока ALLOW_ADMIN_REGISTRATION не включён.
 */
describe('AuthService.registerWithEmail — доступ к регистрации администраторов', () => {
  const buildService = (allowAdminRegistration?: string) => {
    const configService = {
      get: (key: string) =>
        key === 'ALLOW_ADMIN_REGISTRATION' ? allowAdminRegistration : undefined,
    } as unknown as ConfigService;

    const userService = {
      findByEmail: jest.fn().mockResolvedValue(null),
    };

    const service = new AuthService(
      {} as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
      configService,
      {} as never,
      {} as never,
    );

    return { service, userService };
  };

  const registerDto = {
    email: 'admin@example.com',
    password: 'password123',
    name: 'Admin',
  };

  it('отклоняет регистрацию, когда переменная не задана', async () => {
    const { service, userService } = buildService(undefined);

    await expect(service.registerWithEmail(registerDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(userService.findByEmail).not.toHaveBeenCalled();
  });

  it('отклоняет регистрацию при любом значении кроме "true"', async () => {
    for (const value of ['false', '1', 'TRUE', '']) {
      const { service } = buildService(value);

      await expect(
        service.registerWithEmail(registerDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('пропускает дальше, когда переменная равна "true"', async () => {
    const { service, userService } = buildService('true');

    // Дальше по методу идёт работа с репозиторием, которого в тесте нет,
    // поэтому проверяем, что проверка доступа пройдена и поиск по email начался.
    await expect(service.registerWithEmail(registerDto)).rejects.not.toBeInstanceOf(
      ForbiddenException,
    );
    expect(userService.findByEmail).toHaveBeenCalledWith(registerDto.email);
  });
});
