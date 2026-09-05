import type { Account, Customer, Notification, Transaction } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

/** "99900000101" -> "999****0101". KYC numbers are never exposed in full. */
export function maskKycNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 6) return '****';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

/** Prisma Decimal -> number (rounded to 2dp, like the external API returns). */
export function toNumber(value: Decimal | number | string): number {
  return Math.round(Number(value) * 100) / 100;
}

export function customerDto(customer: Customer) {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    kyc: {
      verified: customer.kycVerified,
      type: customer.kycType,
      number: maskKycNumber(customer.kycNumber),
      verifiedAt: customer.kycVerifiedAt,
    },
    createdAt: customer.createdAt,
  };
}

export function accountDto(account: Account) {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankCode: account.bankCode,
    bankName: account.bankName,
    currency: account.currency,
    balance: toNumber(account.balance),
    createdAt: account.createdAt,
  };
}

export function transactionDto(tx: Transaction) {
  return {
    id: tx.id,
    reference: tx.reference,
    from: tx.fromAccount,
    to: tx.toAccount,
    recipientName: tx.recipientName,
    amount: toNumber(tx.amount),
    type: tx.type,
    direction: tx.direction,
    status: tx.status,
    narration: tx.narration,
    errorMessage: tx.errorMessage,
    createdAt: tx.createdAt,
    completedAt: tx.completedAt,
  };
}

export function notificationDto(n: Notification) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    message: n.message,
    amount: n.amount != null ? toNumber(n.amount) : null,
    read: n.read,
    createdAt: n.createdAt,
  };
}