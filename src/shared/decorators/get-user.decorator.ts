import { createParamDecorator } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AuthResponseDto } from '../../auth/dto/auth-response.dto';

export type UserMetadata = {
  userId: string;
  phone: string;
};

export const GetUserMetadata = createParamDecorator(
  (data: unknown, ctx: ExecutionContextHost): UserMetadata | false => {
    const request: Request & { user: UserMetadata } = ctx
      .switchToHttp()
      .getRequest();
    return {
      userId: request.user.userId,
      phone: request.user.phone,
    };
  },
);

// Новый декоратор для получения полных данных аутентификации
export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContextHost): AuthResponseDto => {
    const request: Request & { user: AuthResponseDto } = ctx
      .switchToHttp()
      .getRequest();
    return request.user;
  },
);
