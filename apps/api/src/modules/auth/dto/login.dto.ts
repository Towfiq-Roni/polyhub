import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '@hub/shared';

/**
 * class-validator DTO consumed by Nest's global ValidationPipe at the
 * controller boundary — a deliberately separate mechanism from
 * @hub/shared's `loginSchema` (zod), which is for external consumers
 * (e.g. a future frontend), not duplication to eliminate.
 */
export class LoginDto {
  @ApiProperty({ example: 'ada@example.com', description: 'Trimmed and lowercased before lookup' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
