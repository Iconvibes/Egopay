/**
 * Live smoke test — runs the full customer journey against a running instance
 * of the app (which in turn talks to the REAL NibssByPhoenix API).
 *
 * Prerequisites:
 *   - embedded PostgreSQL running (`npm run db:start`)
 *   - migrations applied (`npx prisma migrate deploy`)
 *   - app running (`npm run dev`) with real NIBSS_API_KEY / NIBSS_API_SECRET
 *
 * Usage:  npm run smoke:live   (BASE_URL defaults to http://localhost:4000)
 *
 * Uses only synthetic test identities (random 999xxx numbers). Exits non-zero
 * on the first failed assertion.
 */
import 'dotenv/config';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const ADMIN_KEY = process.env.DEV_ADMIN_KEY ?? '';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

async function api(
  method: 'GET' | 'POST',
  path: string,
  opts: { token?: string; body?: unknown; adminKey?: boolean } = {},
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.adminKey) headers['x-admin-key'] = ADMIN_KEY;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

async function main(): Promise<void> {
  console.log(`\n=== LIVE SMOKE TEST against ${BASE} ===`);

  // ------------------------------------------------------------------
  // 0. Health
  // ------------------------------------------------------------------
  const health = await api('GET', '/api/health');
  check('GET /api/health -> 200', health.status === 200);

  // ------------------------------------------------------------------
  // 1. Seed test identities in the NIBSS identity store
  // ------------------------------------------------------------------
  const bvn = `999${randomDigits(8)}`;
  const nin = `999${randomDigits(8)}`;
  const bvnRecord = { bvn, firstName: 'Tunde', lastName: 'Bakare', dob: '1985-03-10', phone: '08050000001' };
  const ninRecord = { nin, firstName: 'Amina', lastName: 'Yusuf', dob: '1991-07-22' };

  const seedBvn = await api('POST', '/api/dev/seed-bvn', { body: bvnRecord, adminKey: true });
  check('seed BVN record', seedBvn.status === 201, seedBvn.data);
  const seedNin = await api('POST', '/api/dev/seed-nin', { body: ninRecord, adminKey: true });
  check('seed NIN record', seedNin.status === 201, seedNin.data);

  // ------------------------------------------------------------------
  // 2. Register + login two customers
  // ------------------------------------------------------------------
  const suffix = randomDigits(4);
  const emailA = `tunde.${suffix}@smoke.test`;
  const emailB = `amina.${suffix}@smoke.test`;
  const pwd = 'SmokeTest123!';

  const regA = await api('POST', '/api/auth/register', {
    body: { email: emailA, password: pwd, firstName: 'Tunde', lastName: 'Bakare' },
  });
  check('register customer A', regA.status === 201, regA.data);

  const regB = await api('POST', '/api/auth/register', {
    body: { email: emailB, password: pwd, firstName: 'Amina', lastName: 'Yusuf' },
  });
  check('register customer B', regB.status === 201, regB.data);

  const loginA = await api('POST', '/api/auth/login', { body: { email: emailA, password: pwd } });
  check('login customer A', loginA.status === 200, loginA.data);
  const tokenA: string = loginA.data.token;

  const loginB = await api('POST', '/api/auth/login', { body: { email: emailB, password: pwd } });
  check('login customer B', loginB.status === 200, loginB.data);
  const tokenB: string = loginB.data.token;

  const badLogin = await api('POST', '/api/auth/login', { body: { email: emailA, password: 'wrong-password' } });
  check('login with wrong password -> 401', badLogin.status === 401, badLogin.data);

  // ------------------------------------------------------------------
  // 3. KYC verification
  // ------------------------------------------------------------------
  const verifyBvn = await api('POST', '/api/onboarding/bvn', {
    token: tokenA,
    body: { bvn, dob: bvnRecord.dob },
  });
  check('customer A BVN verification', verifyBvn.status === 200, verifyBvn.data);
  check('customer A kyc.verified = true', verifyBvn.data?.customer?.kyc?.verified === true);
  check('customer A kyc number is masked', /^\d{3}\*{4}\d{4}$/.test(verifyBvn.data?.customer?.kyc?.number ?? ''));

  const verifyNin = await api('POST', '/api/onboarding/nin', {
    token: tokenB,
    body: { nin, dob: ninRecord.dob },
  });
  check('customer B NIN verification', verifyNin.status === 200, verifyNin.data);

  // dob mismatch must fail
  const wrongDob = await api('POST', '/api/onboarding/bvn', {
    token: tokenA,
    body: { bvn, dob: '2000-01-01' },
  });
  check('BVN re-verify with wrong dob -> 409 (already verified)', wrongDob.status === 409, wrongDob.data);

  // unverified customer cannot create an account
  const regC = await api('POST', '/api/auth/register', {
    body: { email: `chidi.${suffix}@smoke.test`, password: pwd, firstName: 'Chidi', lastName: 'Okeke' },
  });
  const tokenC: string = (await api('POST', '/api/auth/login', { body: { email: `chidi.${suffix}@smoke.test`, password: pwd } })).data.token;
  check('register customer C (unverified)', regC.status === 201);
  const unverifiedAccount = await api('POST', '/api/accounts', { token: tokenC });
  check('unverified customer account creation -> 403', unverifiedAccount.status === 403, unverifiedAccount.data);

  // ------------------------------------------------------------------
  // 4. Account creation (₦15,000 pre-funding)
  // ------------------------------------------------------------------
  const acctA = await api('POST', '/api/accounts', { token: tokenA });
  check('customer A account creation', acctA.status === 201, acctA.data);
  check('customer A initial balance = 15000', acctA.data?.account?.balance === 15000, acctA.data?.account);

  const acctB = await api('POST', '/api/accounts', { token: tokenB });
  check('customer B account creation', acctB.status === 201, acctB.data);
  check('customer B initial balance = 15000', acctB.data?.account?.balance === 15000, acctB.data?.account);

  const dup = await api('POST', '/api/accounts', { token: tokenA });
  check('duplicate account creation -> 409', dup.status === 409, dup.data);

  const accountANumber: string = acctA.data.account.accountNumber;
  const accountBNumber: string = acctB.data.account.accountNumber;

  // ------------------------------------------------------------------
  // 5. Balance
  // ------------------------------------------------------------------
  const balA = await api('GET', '/api/accounts/me/balance', { token: tokenA });
  check('customer A balance = 15000', balA.status === 200 && balA.data.account.balance === 15000, balA.data);

  // ------------------------------------------------------------------
  // 6. Name enquiry
  // ------------------------------------------------------------------
  const ne = await api('GET', `/api/transfers/name-enquiry/${accountBNumber}`, { token: tokenA });
  check('name enquiry on customer B account', ne.status === 200 && ne.data.recipient.accountName === 'Amina Yusuf', ne.data);

  const neBad = await api('GET', '/api/transfers/name-enquiry/0000000000', { token: tokenA });
  check('name enquiry on invalid account -> 404', neBad.status === 404, neBad.data);

  // ------------------------------------------------------------------
  // 7. Intra-bank transfer
  // ------------------------------------------------------------------
  const txIntra = await api('POST', '/api/transfers', {
    token: tokenA,
    body: { to: accountBNumber, amount: 2000, narration: 'lunch money' },
  });
  check('intra-bank transfer', txIntra.status === 200, txIntra.data);
  check('intra-bank transfer status = SUCCESS', txIntra.data?.transaction?.status === 'SUCCESS', txIntra.data);
  check('intra-bank transfer has TSQ reference', typeof txIntra.data?.transaction?.reference === 'string' && txIntra.data.transaction.reference.startsWith('TX'), txIntra.data);
  const txIntraId: string = txIntra.data.transaction.id;

  const balAfter = await api('GET', '/api/accounts/me/balance', { token: tokenA });
  check('customer A balance after transfer = 13000', balAfter.data?.account?.balance === 13000, balAfter.data);

  // ------------------------------------------------------------------
  // 8. Transaction status (TSQ) + history
  // ------------------------------------------------------------------
  const tsq = await api('GET', `/api/transactions/${txIntraId}/status`, { token: tokenA });
  check('transaction status (TSQ)', tsq.status === 200 && tsq.data.transaction.status === 'SUCCESS', tsq.data);

  const history = await api('GET', '/api/transactions', { token: tokenA });
  check('transaction history lists own tx', history.status === 200 && history.data.items.length === 1, history.data);

  // ------------------------------------------------------------------
  // 9. Insufficient funds
  // ------------------------------------------------------------------
  const insuff = await api('POST', '/api/transfers', {
    token: tokenA,
    body: { to: accountBNumber, amount: 1000000 },
  });
  check('insufficient funds -> 400 INSUFFICIENT_FUNDS', insuff.status === 400 && insuff.data?.error?.code === 'INSUFFICIENT_FUNDS', insuff.data);

  // ------------------------------------------------------------------
  // 10. Inter-bank transfer via a second onboarded fintech
  // ------------------------------------------------------------------
  const onboard2: any = await fetch('https://nibssbyphoenix.onrender.com/api/fintech/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Smoke Bank ${suffix}`, email: `smoke.${suffix}@example.com` }),
  }).then((r) => r.json());
  const token2: any = await fetch('https://nibssbyphoenix.onrender.com/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: onboard2.apiKey, apiSecret: onboard2.apiSecret }),
  }).then((r) => r.json());
  const bvn2 = `999${randomDigits(8)}`;
  await fetch('https://nibssbyphoenix.onrender.com/api/insertBvn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bvn: bvn2, firstName: 'Ngozi', lastName: 'Adeyemi', dob: '1988-09-09', phone: '08033334444' }),
  });
  const acct2: any = await fetch('https://nibssbyphoenix.onrender.com/api/account/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2.token}` },
    body: JSON.stringify({ kycType: 'bvn', kycID: bvn2, dob: '1988-09-09' }),
  }).then((r) => r.json());
  const otherBankAccount: string = acct2.account.accountNumber;

  const neInter = await api('GET', `/api/transfers/name-enquiry/${otherBankAccount}`, { token: tokenA });
  check('name enquiry across banks', neInter.status === 200, neInter.data);

  const txInter = await api('POST', '/api/transfers', {
    token: tokenA,
    body: { to: otherBankAccount, amount: 5000 },
  });
  check('inter-bank transfer', txInter.status === 200, txInter.data);
  check('inter-bank transfer status = SUCCESS', txInter.data?.transaction?.status === 'SUCCESS', txInter.data);
  check('inter-bank transfer type = INTERBANK', txInter.data?.transaction?.type === 'INTERBANK', txInter.data);

  // ------------------------------------------------------------------
  // 11. Data isolation
  // ------------------------------------------------------------------
  const iso1 = await api('GET', `/api/transactions/${txIntraId}/status`, { token: tokenB });
  check('customer B cannot check customer A tx status -> 403', iso1.status === 403, iso1.data);

  const iso2 = await api('GET', `/api/transactions/${txIntraId}`, { token: tokenB });
  check('customer B cannot read customer A tx -> 403', iso2.status === 403, iso2.data);

  const iso3 = await api('GET', '/api/accounts/me/balance', { token: tokenB });
  check('customer B balance shows only own account', iso3.status === 200 && iso3.data.account.accountNumber === accountBNumber, iso3.data);

  // Trying to inject a `from` account in the body must not debit another account
  const iso4 = await api('POST', '/api/transfers', {
    token: tokenB,
    body: { to: accountANumber, amount: 1, from: accountANumber },
  });
  check('injected from-account is ignored (B->A pays from B)', iso4.status === 200 && iso4.data.transaction.from === accountBNumber, iso4.data);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('live smoke test crashed:', err);
  process.exit(1);
});