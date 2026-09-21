import { ApiProperty } from '@nestjs/swagger';

/**
 * Matches AuthService's AuthUserView shape exactly (auth.service.ts) — reused
 * by both login's `user` field and GET /auth/me's full return.
 */
export class UserViewDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: ['SUPER_ADMIN'], type: [String] })
  roles!: string[];
}

export class LoginResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token (15m)' })
  accessToken!: string;

  @ApiProperty({ type: UserViewDto })
  user!: UserViewDto;
}

export class RefreshResponseDto {
  @ApiProperty({ description: 'Newly issued short-lived JWT access token (15m)' })
  accessToken!: string;
}
