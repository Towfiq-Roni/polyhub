import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';

// postgres-ledger convention: every FK column used in a relation filter gets
// an index. test/auth.e2e-spec.ts's own afterAll cleanup already filters
// `sessions` by `user_id` (`prisma.session.deleteMany({ where: { userId: {
// in: ... } } })`), so this proves that column is actually indexed rather
// than relying on a full table scan.
describe('Session table indexes (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has an index covering sessions(user_id)', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'sessions'
    `;

    const hasUserIdIndex = rows.some((row) => /\(user_id\)/.test(row.indexdef));
    expect(hasUserIdIndex).toBe(true);
  });
});
