import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtRefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh-token',
) {
  constructor(private configService: ConfigService) {
    const jwtRefreshSecret = configService.get<string>('JWT_SECRET_REFRESH');
    if (!jwtRefreshSecret) {
      throw new Error('JWT_SECRET_REFRESH is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: jwtRefreshSecret,
    });
  }

  validate(user: { userId: string }) {
    return user;
  }
}
