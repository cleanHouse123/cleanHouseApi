import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secret',
    });
  }

  async validate(payload: { userId: string; email: string }) {
    let user = await this.userService.findById(payload.userId);
    
    // Если пользователь не найден, проверяем удаленных
    if (!user) {
      const userById = await this.userService.findByIdIncludingDeleted(payload.userId);
      if (userById && userById.deletedAt) {
        // Восстанавливаем удаленного пользователя
        user = await this.userService.restore(userById.id);
      } else if (userById) {
        user = userById;
      }
    }
    
    if (!user) {
      return null;
    }
    
    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      roles: user.roles,
    };
  }
}
