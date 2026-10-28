import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from './app.setup';
import { CreateUserDto } from './modules/users/dto/user-requests.dto';

describe('[F-28] VALIDATION_PIPE_OPTIONS (real ValidationPipe, users DTO)', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const meta = { type: 'body' as const, metatype: CreateUserDto };
  const valid = { email: 'ada@example.com', name: 'Ada', password: 'Temp-Pass-123456' };

  it('strips unknown properties (mass-assignment guard)', async () => {
    const out = await pipe.transform({ ...valid, status: 'INACTIVE', passwordHash: 'x', isAdmin: true }, meta);
    expect(out).toMatchObject(valid);
    expect(out).not.toHaveProperty('status');
    expect(out).not.toHaveProperty('passwordHash');
    expect(out).not.toHaveProperty('isAdmin');
  });

  it('transforms the plain body into a DTO instance', async () => {
    expect(await pipe.transform(valid, meta)).toBeInstanceOf(CreateUserDto);
  });

  it('rejects an invalid known field with BadRequestException', async () => {
    await expect(pipe.transform({ ...valid, password: 'short' }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });
});
