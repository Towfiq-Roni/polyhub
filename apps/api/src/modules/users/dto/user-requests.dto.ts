import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const trimLower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Password policy (assumption, no SRS policy): 12-128 chars, no complexity rules.
export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com', description: 'Trimmed and lowercased before storage' })
  @Transform(trimLower)
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Temp-Pass-123456', minLength: 12, maxLength: 128, description: 'Admin-set password' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

// Only email/name are editable here; status/password are rejected (service 400s on an empty body).
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'ada@example.com' })
  @ValidateIf((_, value) => value !== undefined) // not IsOptional: it also skips null
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace', maxLength: 120 })
  @ValidateIf((_, value) => value !== undefined) // not IsOptional: it also skips null
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'New-Temp-Pass-123!', minLength: 12, maxLength: 128, description: 'Admin-set temp password' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
