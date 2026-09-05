/**
 * Registers this bank with NibssByPhoenix and prints the credentials to put
 * into your .env file. This is the documented "call the onboarding endpoint"
 * first step — credentials are also sent by email.
 *
 * Usage:
 *   npm run onboard -- --name "My Bank" --email "you@example.com"
 */
import { argv } from 'node:process';

function readFlag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const name = readFlag('name');
  const email = readFlag('email');

  if (!name || !email) {
    console.error('Usage: npm run onboard -- --name "Your Bank" --email "you@example.com"');
    process.exit(1);
  }

  const base = process.env.NIBSS_BASE_URL ?? 'https://nibssbyphoenix.onrender.com';
  console.log(`Onboarding fintech "${name}" (${email}) against ${base} ...`);

  const res = await fetch(`${base}/api/fintech/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  const data: any = await res.json();

  if (!res.ok || !data.apiKey || !data.apiSecret) {
    console.error(`Onboarding failed (HTTP ${res.status}):`, data);
    process.exit(1);
  }

  console.log('\nOnboarded successfully:');
  console.log(`  bankCode: ${data.bankCode}`);
  console.log(`  bankName: ${data.bankName}`);
  console.log('\nAdd these to your .env file (never commit them):');
  console.log(`NIBSS_API_KEY=${data.apiKey}`);
  console.log(`NIBSS_API_SECRET=${data.apiSecret}`);
  console.log('\nThen verify the credentials with:');
  console.log('  curl -X POST https://nibssbyphoenix.onrender.com/api/auth/token \\');
  console.log(`    -H "Content-Type: application/json" -d '{"apiKey":"${data.apiKey}","apiSecret":"${data.apiSecret}"}'`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});