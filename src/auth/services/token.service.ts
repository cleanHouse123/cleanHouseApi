import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { expiresAccessIn, expiresRefreshIn } from 'src/shared/constants';

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET_REFRESH');
    if (!secret) {
      throw new Error('JWT_SECRET_REFRESH is not configured');
    }
    return secret;
  }

  async generateAccessToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        userId,
        email,
      },
      {
        secret: this.getAccessSecret(),
        expiresIn: expiresAccessIn,
      },
    );
  }

  async generateRefreshToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        userId,
        email,
      },
      {
        secret: this.getRefreshSecret(),
        expiresIn: expiresRefreshIn,
      },
    );
  }

  async verifyRefreshToken(refreshToken: string): Promise<{ userId: string }> {
    return this.jwtService.verifyAsync(refreshToken, {
      secret: this.getRefreshSecret(),
    });
  }

  async verifyAccessToken(
    accessToken: string,
  ): Promise<{ userId: string; email: string }> {
    return this.jwtService.verifyAsync(accessToken, {
      secret: this.getAccessSecret(),
    });
  }
}
