import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAccessStrategy } from './jwt-access.strategy';
import { PrismaService } from '../../../prisma/prisma.service';

describe('JwtAccessStrategy [F-27]', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;

  function makeStrategy(findUnique: jest.Mock): JwtAccessStrategy {
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return new JwtAccessStrategy(configService, prisma);
  }

  it('returns a minimal user shape for a found, active user', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'super-secret-hash',
      name: 'Ada Lovelace',
      status: 'ACTIVE',
    });
    const strategy = makeStrategy(findUnique);

    const result = await strategy.validate({ sub: 'user-1' });

    expect(result).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      status: 'ACTIVE',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('throws UnauthorizedException when the user does not exist', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const strategy = makeStrategy(findUnique);

    await expect(strategy.validate({ sub: 'ghost' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the user is inactive', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'super-secret-hash',
      name: 'Ada Lovelace',
      status: 'INACTIVE',
    });
    const strategy = makeStrategy(findUnique);

    await expect(strategy.validate({ sub: 'user-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
