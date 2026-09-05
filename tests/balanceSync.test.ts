import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { logger } from '../src/lib/logger.js';
import { nibssClient } from '../src/services/nibss/index.js';
import { syncAccountBalance, syncAccountBalanceBestEffort } from '../src/services/balanceSync.js';

// ---------------------------------------------------------------------------
// Unit suite for src/services/balanceSync.ts — the ledger-vs-cache reconciler
// behind balance checks and incoming-payment detection. The prisma singleton,
// the Nibss client and the logger are all mocked so the module runs in
// isolation (no DB, no network).
// ---------------------------------------------------------------------------

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    account: { findUnique: vi.fn(), update: vi.fn() },
    transaction: { create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/services/nibss/index.js', () => ({
  nibssClient: { getBalance: vi.fn() },
}));

type Acct = { id: string; customerId: string; accountNumber: string; balance: Prisma.Decimal };
type BalanceRes = { accountNumber: string; accountName: string; balance: number };

const ACCOUNT_ID = 'acct-1';
const ACCOUNT_NO = '2866447908';
const CUSTOMER_ID = 'cust-1';

function account(cache: number | string): Acct {
  return { id: ACCOUNT_ID, customerId: CUSTOMER_ID, accountNumber: ACCOUNT_NO, balance: new Prisma.Decimal(cache) };
}

function ledger(balance: number): BalanceRes {
  return { accountNumber: ACCOUNT_NO, accountName: 'Amara Obi', balance };
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`reference`)', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });

beforeEach(() => {
  prisma.account.findUnique.mockResolvedValue(account(15000));
  prisma.account.update.mockImplementation(async (args: { where: { id: string }; data: { balance: number } }) =>
    account(Number(args.data.balance)),
  );
  prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
  prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });
  // Default "transaction": await each operation in order (throws if one rejects).
  prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
    const out: unknown[] = [];
    for (const op of ops) out.push(await op);
    return out;
  });
  nibssClient.getBalance.mockResolvedValue(ledger(17500));
});

describe('syncAccountBalance — incoming credit detection', () => {
  it('records a CREDIT transaction + notification for a positive delta and persists the new cache', async () => {
    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    expect(result).toEqual({ balance: 17500, creditDetected: true, amount: 2500 });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID }, data: { balance: 17500 } });

    const create = prisma.transaction.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(create.data).toMatchObject({
      customerId: CUSTOMER_ID,
      fromAccount: 'EXTERNAL',
      toAccount: ACCOUNT_NO,
      amount: 2500,
      type: 'INCOMING',
      direction: 'CREDIT',
      status: 'SUCCESS',
    });
    expect(String(create.data.reference)).toMatch(/^INCOMING-2866447908-1750000-/);

    const notif = prisma.notification.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(notif.data).toMatchObject({ kind: 'INCOMING_CREDIT', title: 'Payment received', amount: 2500 });
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ amount: 2500 }), 'incoming payment detected on ledger');
  });

  it('rounds the ledger and the recorded amount to 2 decimal places', async () => {
    prisma.account.findUnique.mockResolvedValue(account('15000.00'));
    nibssClient.getBalance.mockResolvedValue(ledger(17500.128));

    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    // 17500.128 -> 17500.13 ; delta 2500.13
    expect(result).toEqual({ balance: 17500.13, creditDetected: true, amount: 2500.13 });
    expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID }, data: { balance: 17500.13 } });
  });

  it('detects nothing when the ledger equals the cache', async () => {
    nibssClient.getBalance.mockResolvedValue(ledger(15000));

    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    expect(result).toEqual({ balance: 15000, creditDetected: false });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('returns null and never calls the ledger when the account does not exist', async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    const result = await syncAccountBalance('acct-missing', ACCOUNT_NO);

    expect(result).toBeNull();
    expect(nibssClient.getBalance).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe('syncAccountBalance — duplicate-credit races', () => {
  it('shares one outcome when syncs for the same account overlap (in-flight serialization)', async () => {
    // Keep the ledger call pending so the first sync is mid-flight, inFlight-set,
    // when the second sync arrives.
    let release!: (v: BalanceRes) => void;
    nibssClient.getBalance.mockReturnValue(new Promise<BalanceRes>((r) => (release = r)));

    const first = syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);
    const second = syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    release(ledger(17500));
    const [a, b] = await Promise.all([first, second]);

    expect(b).toBe(a); // the second call reused the first's in-flight promise
    expect(a).toEqual({ balance: 17500, creditDetected: true, amount: 2500 });
    // Exactly one credit and one notification for one payment.
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(nibssClient.getBalance).toHaveBeenCalledTimes(1);
  });

  it('treats a unique-constraint collision (P2002) as already recorded: cache-only resync', async () => {
    // Simulates a sync running in another process/thread that recorded the
    // credit first; this sync's identical reference loses the commit race.
    prisma.$transaction.mockRejectedValueOnce(p2002());

    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    expect(result).toEqual({ balance: 17500, creditDetected: false });
    // The cache is still refreshed to the ledger so future syncs diff against 0.
    expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID }, data: { balance: 17500 } });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1); // attempted, rolled back
  });

  it('never double-records across consecutive syncs (cache baseline moves forward)', async () => {
    const first = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);
    expect(first).toMatchObject({ creditDetected: true, amount: 2500 });

    // Second sync: the cache was already updated to 17500 and the ledger is
    // unchanged — the same payment must not be detected again.
    prisma.account.findUnique.mockResolvedValue(account(17500));
    nibssClient.getBalance.mockResolvedValue(ledger(17500));

    const second = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);
    expect(second).toEqual({ balance: 17500, creditDetected: false });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});

describe('syncAccountBalance — negative / unexpected deltas', () => {
  it('resyncs the cache to the ledger when the balance fell, without recording a credit', async () => {
    nibssClient.getBalance.mockResolvedValue(ledger(12000)); // ledger < cache 15000

    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    expect(result).toEqual({ balance: 12000, creditDetected: false });
    expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID }, data: { balance: 12000 } });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCOUNT_ID, delta: -3000 }),
      'ledger balance fell without a local transfer — cache resynced',
    );
  });

  it('treats sub-kobo noise (|delta| < 0.01) as no movement and trusts the ledger', async () => {
    prisma.account.findUnique.mockResolvedValue(account('15000.00'));
    nibssClient.getBalance.mockResolvedValue(ledger(15000.004));

    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);

    expect(result).toEqual({ balance: 15000, creditDetected: false });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('syncAccountBalance — Nibss outages', () => {
  it('propagates the upstream failure without writing anything locally', async () => {
    const boom = new Error('connect ETIMEDOUT 10.0.0.1:443');
    nibssClient.getBalance.mockRejectedValueOnce(boom);

    await expect(syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO)).rejects.toThrow(boom);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('cleans up the in-flight entry so a later sync retries and succeeds', async () => {
    nibssClient.getBalance.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO)).rejects.toThrow('ECONNRESET');

    // Same account, next tick: must not share the failed promise.
    const result = await syncAccountBalance(ACCOUNT_ID, ACCOUNT_NO);
    expect(result).toEqual({ balance: 17500, creditDetected: true, amount: 2500 });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('swallows the outage in the best-effort variant (fire-and-forget call sites)', async () => {
    nibssClient.getBalance.mockRejectedValueOnce(new Error('service unreachable'));

    await expect(syncAccountBalanceBestEffort(ACCOUNT_ID, ACCOUNT_NO)).resolves.toBeUndefined();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
