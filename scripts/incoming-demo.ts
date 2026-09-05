/**
 * Incoming-payment demo — sends money from a freshly onboarded sender bank on
 * the shared NibssByPhoenix ledger INTO the first account in this app's
 * database. The app's background poller detects the credit within one poll
 * interval (BALANCE_POLL_INTERVAL_S, default 10s) and records a CREDIT
 * transaction + a "Payment received" notification — which the frontend
 * surfaces as a toast, a bell badge, and a green +₦ history row.
 *
 * Usage:
 *   npx tsx scripts/incoming-demo.ts [amount]
 *
 * Optional overrides:
 *   TARGET_ACCOUNT=<accountNumber>   recipient (default: first local account)
 *   INCOMING_AMOUNT=<amount>         amount (or first CLI arg)
 *
 * Uses only synthetic test identities.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = 'https://nibssbyphoenix.onrender.com';
const AMOUNT = Number(process.argv[2] ?? process.env.INCOMING_AMOUNT ?? 2500);
const prisma = new PrismaClient();

const randomDigits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

async function json(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function main(): Promise<void> {
  const target = process.env.TARGET_ACCOUNT ?? (await prisma.account.findFirst())?.accountNumber;
  if (!target) {
    console.error('No local account found — open an account in the app first.');
    process.exit(1);
  }
  console.log(`\nSending ₦${AMOUNT} to ${target} from a freshly onboarded sender bank...`);

  // 1. Onboard a brand-new sender fintech on the shared ledger.
  const suffix = randomDigits(5);
  const onboard = await json('/api/fintech/onboard', {
    method: 'POST',
    body: JSON.stringify({ name: `EgoPay Sender ${suffix}`, email: `sender.${suffix}@egopay.demo` }),
  });
  const auth = await json('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ apiKey: onboard.apiKey, apiSecret: onboard.apiSecret }),
  });

  // 2. Register a synthetic identity and open the sender's account.
  const bvn = `999${randomDigits(8)}`;
  const inserted = await json('/api/insertBvn', {
    method: 'POST',
    body: JSON.stringify({ bvn, firstName: 'Sender', lastName: 'Bank', dob: '1990-01-01', phone: '08070000001' }),
  });
  if (inserted?.error || inserted?.message === 'BVN not found') {
    console.error('insertBvn failed:', JSON.stringify(inserted));
    process.exit(1);
  }
  if (!auth.token) {
    console.error('login failed:', JSON.stringify(auth));
    process.exit(1);
  }
  const acct = await json('/api/account/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ kycType: 'bvn', kycID: bvn, dob: '1990-01-01' }),
  });
  if (!acct.account?.accountNumber) {
    console.error('account/create failed:', JSON.stringify(acct));
    process.exit(1);
  }
  const from: string = acct.account.accountNumber;

  // 3. Transfer INTO the app's account.
  const tx = await json('/api/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ from, to: target, amount: AMOUNT }),
  });

  console.log(`Sender account (${onboard.name}): ${from}`);
  console.log('Transfer result:', JSON.stringify(tx));
  const tsq = tx.reference ?? tx.transactionId ?? tx.id;
  console.log(`\n✅ ₦${AMOUNT} sent to ${target} (TSQ ${tsq ?? 'n/a'}).`);
  console.log(
    `The EgoPay poller will detect the credit within ${process.env.BALANCE_POLL_INTERVAL_S ?? 10}s — watch the dashboard: toast, bell badge, and a green +₦${AMOUNT} row in history.`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('incoming demo failed:', err);
  process.exit(1);
});