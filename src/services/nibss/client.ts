import axios, { AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { NibssError } from './nibssError.js';
import type {
  AllAccountsResponse,
  BalanceResponse,
  CreateAccountResponse,
  FintechOnboardInput,
  FintechOnboardResponse,
  IdentityRecord,
  LoginResponse,
  NameEnquiryResponse,
  TransactionStatusResponse,
  TransferResponse,
} from './types.js';

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: object;
  /** Defaults to true — the fintech JWT is attached to protected endpoints. */
  auth?: boolean;
}

/**
 * Thin HTTP client for the NibssByPhoenix simulated NIBSS API.
 *
 * Responsibilities:
 *  - base URL, JSON headers, timeouts
 *  - fintech JWT lifecycle (obtain on demand, cache, refresh before expiry)
 *  - normalization of the (inconsistent) upstream response shapes
 *  - conversion of upstream failures into NibssError
 *
 * The rest of the application never makes raw HTTP calls to NibssByPhoenix.
 */
export class NibssClient {
  private token: string | null = null;
  private tokenExpiresAtMs = 0;

  // ------------------------------------------------------------------
  // Public API surface (all 12 documented endpoints)
  // ------------------------------------------------------------------

  /** POST /api/fintech/onboard — public, no auth. */
  async onboardFintech(input: FintechOnboardInput): Promise<FintechOnboardResponse> {
    const data = await this.request<FintechOnboardResponse>({
      method: 'POST',
      path: '/api/fintech/onboard',
      body: input,
      auth: false,
    });
    return data;
  }

  /** POST /api/auth/token — public, no auth. Returns the fintech JWT. */
  async login(apiKey: string, apiSecret: string): Promise<LoginResponse> {
    // Verified against the live API: the request fields are camelCase
    // apiKey/apiSecret (the PDF shows lowercase, which is rejected).
    const data = await this.request<LoginResponse>({
      method: 'POST',
      path: '/api/auth/token',
      body: { apiKey, apiSecret },
      auth: false,
    });
    return data;
  }

  /** POST /api/account/create — JWT required. */
  async createAccount(kycType: 'bvn' | 'nin', kycID: string, dob: string): Promise<CreateAccountResponse> {
    const raw = await this.request<{
      message?: string;
      account?: CreateAccountResponse;
      accountNumber?: string;
      balance?: number;
      bankCode?: string;
      bankName?: string;
      accountName?: string;
      kycType?: string;
      kycID?: string;
    }>({
      method: 'POST',
      path: '/api/account/create',
      body: { kycType, kycID, dob },
    });
    const account = raw.account ?? raw;
    return {
      accountNumber: String(account.accountNumber ?? ''),
      accountName: account.accountName ?? '',
      bankCode: account.bankCode ?? '',
      bankName: account.bankName,
      balance: Number(account.balance ?? 0),
      kycType: account.kycType,
      kycID: account.kycID,
    };
  }

  /** GET /api/account/name-enquiry/{accountNumber} — JWT required. */
  async nameEnquiry(accountNumber: string): Promise<NameEnquiryResponse> {
    const raw = await this.request<NameEnquiryResponse>({
      method: 'GET',
      path: `/api/account/name-enquiry/${accountNumber}`,
    });
    return {
      accountNumber: String(raw.accountNumber ?? accountNumber),
      accountName: raw.accountName ?? '',
      bankCode: raw.bankCode,
      bankName: raw.bankName,
    };
  }

  /** GET /api/accounts — JWT required. */
  async listAccounts(): Promise<AllAccountsResponse> {
    const raw = await this.request<AllAccountsResponse>({ method: 'GET', path: '/api/accounts' });
    return {
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    };
  }

  /** GET /api/account/balance/{accountNumber} — JWT required. */
  async getBalance(accountNumber: string): Promise<BalanceResponse> {
    const raw = await this.request<BalanceResponse>({
      method: 'GET',
      path: `/api/account/balance/${accountNumber}`,
    });
    return {
      accountNumber: String(raw.accountNumber ?? accountNumber),
      accountName: raw.accountName,
      balance: Number(raw.balance ?? 0),
    };
  }

  /** POST /api/transfer — JWT required. */
  async transfer(from: string, to: string, amount: number): Promise<TransferResponse> {
    const raw = await this.request<TransferResponse>({
      method: 'POST',
      path: '/api/transfer',
      body: { from, to, amount: String(amount) },
    });
    return {
      reference: raw.reference ?? '',
      status: raw.status ?? 'PENDING',
      amount: Number(raw.amount ?? amount),
      from: raw.from ?? raw.senderAccount,
      to: raw.to ?? raw.receiverAccount,
    };
  }

  /** GET /api/transaction/{transactionId} — JWT required. */
  async getTransactionStatus(transactionId: string): Promise<TransactionStatusResponse> {
    const raw = await this.request<TransactionStatusResponse & { createdAt?: string }>({
      method: 'GET',
      path: `/api/transaction/${transactionId}`,
    });
    return {
      reference: raw.reference ?? transactionId,
      status: raw.status ?? 'PENDING',
      amount: raw.amount !== undefined ? Number(raw.amount) : undefined,
      from: raw.from ?? raw.senderAccount,
      to: raw.to ?? raw.receiverAccount,
      timestamp: raw.timestamp ?? raw.createdAt,
    };
  }

  /** POST /api/insertBvn — no JWT required (verified against live API). */
  async insertBvn(input: {
    bvn: string;
    firstName: string;
    lastName: string;
    dob: string;
    phone?: string;
  }): Promise<IdentityRecord> {
    const raw = await this.request<{
      data?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string; phone?: string };
      response?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string; phone?: string };
      bvn?: string;
      nin?: string;
    }>({
      method: 'POST',
      path: '/api/insertBvn',
      body: input,
      auth: false,
    });
    const rec = raw.data ?? raw.response ?? raw;
    return this.toIdentityRecord(rec, input.bvn);
  }

  /** POST /api/insertNin — no JWT required (verified against live API). */
  async insertNin(input: { nin: string; firstName: string; lastName: string; dob: string }): Promise<IdentityRecord> {
    const raw = await this.request<{
      data?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string };
      response?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string };
      bvn?: string;
      nin?: string;
    }>({
      method: 'POST',
      path: '/api/insertNin',
      body: input,
      auth: false,
    });
    const rec = raw.data ?? raw.response ?? raw;
    return this.toIdentityRecord(rec, input.nin);
  }

  /** POST /api/validateBvn — no JWT required. */
  async validateBvn(bvn: string): Promise<IdentityRecord> {
    const raw = await this.request<{
      data?: { bvn?: string; firstName?: string; lastName?: string; dob?: string; phone?: string };
      response?: { bvn?: string; firstName?: string; lastName?: string; dob?: string; phone?: string };
      bvn?: string;
      firstName?: string;
      lastName?: string;
      dob?: string;
    }>({
      method: 'POST',
      path: '/api/validateBvn',
      body: { bvn },
      auth: false,
    });
    const rec = raw.data ?? raw.response ?? raw;
    return this.toIdentityRecord(rec, bvn);
  }

  /** POST /api/validateNin — no JWT required. */
  async validateNin(nin: string): Promise<IdentityRecord> {
    const raw = await this.request<{
      data?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string };
      response?: { bvn?: string; nin?: string; firstName?: string; lastName?: string; dob?: string };
      bvn?: string;
      nin?: string;
      firstName?: string;
      lastName?: string;
      dob?: string;
    }>({
      method: 'POST',
      path: '/api/validateNin',
      body: { nin },
      auth: false,
    });
    const rec = raw.data ?? raw.response ?? raw;
    return this.toIdentityRecord(rec, nin);
  }

  // ------------------------------------------------------------------
  // Token lifecycle
  // ------------------------------------------------------------------

  /**
   * Returns a valid fintech JWT, re-authenticating only when the cached token
   * is missing or close to expiry. The Nibss JWT is valid for 1 hour; we
   * refresh it `NIBSS_TOKEN_REFRESH_LEEWAY_S` seconds before it expires, so a
   * long-running process does not log in on every single request.
   */
  private async getToken(): Promise<string> {
    const leewayMs = env.NIBSS_TOKEN_REFRESH_LEEWAY_S * 1000;
    if (this.token && this.tokenExpiresAtMs > Date.now() + leewayMs) {
      return this.token;
    }

    logger.debug('nibss: acquiring fresh fintech JWT');
    const res = await this.login(env.NIBSS_API_KEY, env.NIBSS_API_SECRET);
    this.token = res.token;
    this.tokenExpiresAtMs = this.decodeExpiry(res.token);
    logger.info({ expiresInSeconds: Math.round((this.tokenExpiresAtMs - Date.now()) / 1000) }, 'nibss: fintech JWT acquired');
    return this.token;
  }

  private decodeExpiry(token: string): number {
    try {
      const payload = token.split('.')[1];
      if (!payload) return 0;
      const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof json.exp === 'number' ? json.exp * 1000 : 0;
    } catch {
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // HTTP plumbing
  // ------------------------------------------------------------------

  private async request<T>(opts: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.auth !== false) {
      headers.Authorization = `Bearer ${await this.getToken()}`;
    }

    try {
      const res = await axios.request<T>({
        method: opts.method,
        url: `${env.NIBSS_BASE_URL}${opts.path}`,
        headers,
        data: opts.body,
        timeout: env.NIBSS_TIMEOUT_MS,
        validateStatus: () => true, // we inspect status ourselves below
      });

      // The API returns errors with proper status codes (400/404/401/409...).
      // Treat 2xx as success; anything else as an upstream error.
      if (res.status < 200 || res.status >= 300) {
        throw new NibssError(
          this.extractMessage(res.data) ?? `NibssByPhoenix returned HTTP ${res.status}`,
          res.status,
          'UPSTREAM_ERROR',
          res.data,
        );
      }
      return res.data;
    } catch (err) {
      if (err instanceof NibssError) throw err;
      throw this.normalizeNetworkError(err, opts.path);
    }
  }

  private extractMessage(data: unknown): string | undefined {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      for (const key of ['message', 'error', 'errors']) {
        const v = obj[key];
        if (typeof v === 'string' && v.length > 0) return v;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
      }
    }
    return undefined;
  }

  private normalizeNetworkError(err: unknown, path: string): NibssError {
    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
      logger.warn({ path, code: axiosErr.code }, 'nibss: upstream request timed out');
      return new NibssError(`NibssByPhoenix request timed out (${path})`, undefined, 'TIMEOUT');
    }
    if (axiosErr.response) {
      return new NibssError(
        this.extractMessage(axiosErr.response.data) ?? `NibssByPhoenix returned HTTP ${axiosErr.response.status}`,
        axiosErr.response.status,
        'UPSTREAM_ERROR',
        axiosErr.response.data,
      );
    }
    logger.warn({ path, code: axiosErr.code, message: axiosErr.message }, 'nibss: upstream unreachable');
    return new NibssError(`NibssByPhoenix unreachable (${axiosErr.message})`, undefined, 'NETWORK');
  }

  private toIdentityRecord(rec: Record<string, unknown>, fallbackNumber: string): IdentityRecord {
    return {
      number: String(rec.bvn ?? rec.nin ?? fallbackNumber ?? ''),
      firstName: String(rec.firstName ?? ''),
      lastName: String(rec.lastName ?? ''),
      dob: this.normalizeDob(rec.dob),
      phone: rec.phone !== undefined ? String(rec.phone) : undefined,
    };
  }

  /** "1992-06-15T00:00:00.000Z" -> "1992-06-15" */
  private normalizeDob(dob: unknown): string {
    if (typeof dob !== 'string') return '';
    const m = dob.match(/^(\d{4}-\d{2}-\d{2})/);
    return m && m[1] ? m[1] : dob;
  }
}

export type { TransactionStatusResponse as NibssTransactionStatus };