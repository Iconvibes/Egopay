import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/appError.js';
import { accountDto } from '../../lib/dto.js';
import { prisma } from '../../lib/prisma.js';
import { syncAccountBalance } from '../../services/balanceSync.js';
import { NibssError, nibssClient } from '../../services/nibss/index.js';

export async function getAccountForCustomer(customerId: string) {
  return prisma.account.findUnique({ where: { customerId } });
}

/** The customer's account or a clean 404. */
export async function requireAccount(customerId: string) {
  const account = await getAccountForCustomer(customerId);
  if (!account) {
    throw Errors.notFound('No account found for this customer. Create one first.', 'NO_ACCOUNT');
  }
  return account;
}

/**
 * Creates the customer's single bank account through NibssByPhoenix.
 * Guards (all enforced):
 *  1. KYC must be completed (business rule).
 *  2. At most one account per customer (business rule + DB unique constraint).
 *  3. kycNumber unique on Customer (a second customer cannot reuse the same
 *     identity to open another account).
 */
export async function createAccount(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { account: true },
  });
  if (!customer) throw Errors.notFound('Customer not found');
  if (!customer.kycVerified || !customer.kycNumber || !customer.kycType || !customer.kycDob) {
    throw Errors.forbidden(
      'KYC verification (BVN or NIN) is required before an account can be created',
      'KYC_REQUIRED',
    );
  }
  if (customer.account) {
    throw Errors.conflict('This customer already has an account', 'ACCOUNT_EXISTS');
  }

  const dob = customer.kycDob.toISOString().slice(0, 10);

  let created;
  try {
    created = await nibssClient.createAccount(customer.kycType.toLowerCase() as 'bvn' | 'nin', customer.kycNumber, dob);
  } catch (err) {
    throw mapCreateAccountError(err);
  }

  if (!created.accountNumber) {
    throw Errors.badGateway('Account service returned an invalid response');
  }

  try {
    const account = await prisma.account.create({
      data: {
        customerId: customer.id,
        accountNumber: created.accountNumber,
        accountName: created.accountName || `${customer.firstName} ${customer.lastName}`,
        bankCode: created.bankCode,
        bankName: created.bankName ?? '',
        balance: created.balance,
      },
    });
    return accountDto(account);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Errors.conflict('This customer already has an account', 'ACCOUNT_EXISTS');
    }
    throw err;
  }
}

export async function getMyAccount(customerId: string) {
  const account = await requireAccount(customerId);
  return accountDto(account);
}

/**
 * Live balance from the NibssByPhoenix ledger. The local balance is a cache —
 * the external API is the source of truth, so we refresh it on every query.
 *
 * The refresh runs through the balance reconciler, which also detects and
 * records incoming payments (positive ledger-vs-cache deltas) as CREDIT
 * transactions + notifications — so a manual refresh surfaces money that
 * arrived since the last poll, instantly.
 */
export async function getMyBalance(customerId: string) {
  const account = await requireAccount(customerId);

  try {
    await syncAccountBalance(account.id, account.accountNumber);
  } catch (err) {
    throw mapBalanceError(err);
  }

  const updated = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  return accountDto(updated);
}

function mapCreateAccountError(err: unknown): never {
  if (err instanceof NibssError) {
    if (err.statusCode === 409 || (err.statusCode === 400 && /already linked/i.test(err.message))) {
      throw Errors.conflict(
        `${err.message}. If you were interrupted during a previous attempt, this identity may already have an account.`,
        'IDENTITY_LINKED',
      );
    }
    if (err.statusCode === 400 || err.statusCode === 404) {
      throw Errors.badRequest(err.message, 'ACCOUNT_CREATION_FAILED');
    }
    if (err.statusCode === 401) {
      throw Errors.badGateway('Fintech authentication with the account service failed');
    }
    if (err.code === 'TIMEOUT') {
      throw Errors.gatewayTimeout('The account service timed out. Please try again.');
    }
    if (err.code === 'NETWORK') {
      throw Errors.badGateway('The account service is unreachable. Please try again later.');
    }
    throw Errors.badGateway(`The account service returned an error (${err.message})`);
  }
  throw err;
}

function mapBalanceError(err: unknown): never {
  if (err instanceof NibssError) {
    if (err.statusCode === 404) throw Errors.notFound('Account not found in the banking network');
    if (err.statusCode === 401) throw Errors.badGateway('Fintech authentication with the account service failed');
    if (err.code === 'TIMEOUT') throw Errors.gatewayTimeout('The balance service timed out. Please try again.');
    if (err.code === 'NETWORK') throw Errors.badGateway('The balance service is unreachable. Please try again later.');
    throw Errors.badGateway(`The balance service returned an error (${err.message})`);
  }
  throw err;
}