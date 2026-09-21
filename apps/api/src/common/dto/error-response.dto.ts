import { ApiProperty } from '@nestjs/swagger';

/**
 * Matches HttpExceptionFilter's actual `{ error: { statusCode, message } }`
 * envelope for a single-message error (401 invalid credentials, 429
 * throttled, etc. — any HttpException whose response carries a plain string
 * message).
 */
export class ErrorDetailDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Invalid credentials' })
  message!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}

/**
 * Same envelope, but for the global ValidationPipe's BadRequestException —
 * class-validator reports one message per failed field, so `message` is an
 * array here instead of a single string.
 */
export class ValidationErrorDetailDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: ['email must be an email'], type: [String] })
  message!: string[];
}

export class ValidationErrorResponseDto {
  @ApiProperty({ type: ValidationErrorDetailDto })
  error!: ValidationErrorDetailDto;
}
