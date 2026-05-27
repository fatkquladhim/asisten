import { getDb } from '@/config/database';
import { accounts } from '@/db/schema/finance';

// Seed function untuk membuat akun paper trading
async function seed() {
  const db = getDb();
  const existing = await db.select().from(accounts).limit(1);
  if (existing.length > 0) {
    console.log('Account already exists');
    process.exit(0);
  }
  await db.insert(accounts).values({
    name: 'Paper Trading',
    type: 'paper',
    platform: 'internal',
    balance: '1000000', // 10 jt IDR initial
    currency: 'IDR',
    meta: { isPaperTrading: true },
  });
  console.log('Paper trading account seeded (balance: Rp 1,000,000)');
  process.exit(0);
}

seed().catch(console.error);