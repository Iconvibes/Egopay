const TOKEN_KEY = 'egopay_token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  adminKey?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.adminKey) headers['x-admin-key'] = options.adminKey;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    const err = data as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(
      res.status,
      err?.error?.code ?? 'REQUEST_FAILED',
      err?.error?.message ?? `Request failed (HTTP ${res.status})`,
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Typed API surface
// ---------------------------------------------------------------------------

export interface KycState {
  verified: boolean;
  type: 'BVN' | 'NIN' | null;
  number: string | null;
  verifiedAt: string | null;
}

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  kyc: KycState;
  createdAt: string;
}

export interface Account {
  id: string;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  currency: string;
  balance: number;
  createdAt: string;
}

export interface Recipient {
  accountNumber: string;
  accountName: string;
  bankCode: string | null;
  bankName: string | null;
}

export interface TransactionItem {
  id: string;
  reference: string | null;
  from: string;
  to: string;
  recipientName: string | null;
  amount: number;
  type: 'INTRABANK' | 'INTERBANK' | 'INCOMING';
  direction: 'DEBIT' | 'CREDIT';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  narration: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  amount: number | null;
  read: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  // Auth
  register: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
    request<{ message: string; customer: Customer }>('/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    request<{ message: string; token: string; customer: Customer }>('/auth/login', { method: 'POST', body }),
  me: () => request<{ customer: Customer }>('/auth/me'),

  // KYC
  verifyBvn: (body: { bvn: string; dob: string }) =>
    request<{ message: string; customer: Customer }>('/onboarding/bvn', { method: 'POST', body }),
  verifyNin: (body: { nin: string; dob: string }) =>
    request<{ message: string; customer: Customer }>('/onboarding/nin', { method: 'POST', body }),
  demoBvn: () => request<{ message: string; identity: { number: string; dob: string } }>('/onboarding/demo-bvn', { method: 'POST', body: {} }),
  demoNin: () => request<{ message: string; identity: { number: string; dob: string } }>('/onboarding/demo-nin', { method: 'POST', body: {} }),

  // Account
  createAccount: () => request<{ message: string; account: Account }>('/accounts', { method: 'POST', body: {} }),
  myAccount: () => request<{ account: Account }>('/accounts/me'),
  myBalance: () => request<{ account: Account }>('/accounts/me/balance'),

  // Transfers
  nameEnquiry: (accountNumber: string) => request<{ recipient: Recipient }>(`/transfers/name-enquiry/${accountNumber}`),
  transfer: (body: { to: string; amount: number; narration?: string }) =>
    request<{ message: string; transaction: TransactionItem }>('/transfers', { method: 'POST', body }),

  // Transactions
  transactions: (params: { page?: number; limit?: number; status?: string; type?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.status) qs.set('status', params.status);
    if (params.type) qs.set('type', params.type);
    const query = qs.toString();
    return request<Paginated<TransactionItem>>(`/transactions${query ? `?${query}` : ''}`);
  },
  transaction: (id: string) => request<{ transaction: TransactionItem }>(`/transactions/${id}`),
  transactionStatus: (id: string) =>
    request<{ transaction: TransactionItem; source?: string; note?: string }>(`/transactions/${id}/status`),

  // Notifications (incoming-payment alerts)
  notifications: (unreadOnly = false) =>
    request<{ items: NotificationItem[]; unreadCount: number }>(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`),
  markNotificationRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST', body: {} }),
  markAllNotificationsRead: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST', body: {} }),

  // Dev identity seeding (requires backend DEV_ADMIN_KEY)
  seedBvn: (body: { bvn: string; firstName: string; lastName: string; dob: string; phone?: string }, adminKey: string) =>
    request('/dev/seed-bvn', { method: 'POST', body, adminKey }),
  seedNin: (body: { nin: string; firstName: string; lastName: string; dob: string }, adminKey: string) =>
    request('/dev/seed-nin', { method: 'POST', body, adminKey }),
};