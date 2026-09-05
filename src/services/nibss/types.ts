/**
 * Typed contracts for the NibssByPhoenix simulated NIBSS API.
 *
 * These types describe the NORMALIZED shapes our client returns. The raw
 * upstream payloads are inconsistent (some endpoints wrap data in `data`,
 * some in `response`, some flat), so the client normalizes them here and the
 * rest of the application never sees upstream quirks.
 */

export interface FintechOnboardInput {
  name: string;
  email: string;
}

export interface FintechOnboardResponse {
  apiKey: string;
  apiSecret: string;
  bankCode: string;
  bankName: string;
}

export interface LoginResponse {
  token: string;
  fintech: {
    name: string;
    email: string;
    bankCode: string;
    bankName: string;
  };
}

export interface IdentityRecord {
  /** BVN or NIN number (11 digits) */
  number: string;
  firstName: string;
  lastName: string;
  /** ISO date, e.g. "1992-06-15" */
  dob: string;
  phone?: string;
}

export interface CreateAccountResponse {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
  /** Ledger balance as reported by the external API (15,000 on creation). */
  balance: number;
  kycType?: string;
  kycID?: string;
}

export interface NameEnquiryResponse {
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  bankName?: string;
}

export interface BalanceResponse {
  accountNumber: string;
  accountName?: string;
  balance: number;
}

export interface TransferResponse {
  /** Unique transaction reference (TSQ), e.g. "TX1776340463722". */
  reference: string;
  status: string;
  amount: number;
  from?: string;
  to?: string;
  senderAccount?: string;
  receiverAccount?: string;
}

export interface TransactionStatusResponse {
  reference: string;
  status: string;
  amount?: number;
  from?: string;
  to?: string;
  senderAccount?: string;
  receiverAccount?: string;
  timestamp?: string;
}

export interface AllAccountsResponse {
  accounts: Array<{
    accountNumber: string;
    accountName: string;
    balance: number;
    bankCode?: string;
  }>;
}