import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken, type Account, type Customer } from '../lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  customer: Customer | null;
  account: Account | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => void;
  setCustomer: (customer: Customer | null) => void;
  setAccount: (account: Account | null) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Identity-preserving setters.
//
// An effect that depends on the `account`/`customer` object (or the context
// value built from them) is only safe if those references stay stable while
// the data they represent is unchanged. Otherwise a balance refresh that
// stores a freshly-fetched object re-keys the effect, the effect fetches
// again, and so on — the infinite-loop bug this project hit on the Dashboard.
//
// These wrappers compare the meaningful fields and return the PREVIOUS object
// when nothing changed, so re-fetching identical data never churns identity.
// Dependents keyed on the object therefore re-run only on real changes.
// ---------------------------------------------------------------------------

function sameKyc(a: Customer['kyc'], b: Customer['kyc']): boolean {
  return (
    a.verified === b.verified &&
    a.type === b.type &&
    a.number === b.number &&
    a.verifiedAt === b.verifiedAt
  );
}

function sameCustomer(a: Customer | null, b: Customer | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.phone === b.phone &&
    a.createdAt === b.createdAt &&
    sameKyc(a.kyc, b.kyc)
  );
}

function sameAccount(a: Account | null, b: Account | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.accountNumber === b.accountNumber &&
    a.accountName === b.accountName &&
    a.bankCode === b.bankCode &&
    a.bankName === b.bankName &&
    a.currency === b.currency &&
    a.balance === b.balance &&
    a.createdAt === b.createdAt
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [account, setAccountState] = useState<Account | null>(null);

  const setCustomer = useCallback((next: Customer | null) => {
    setCustomerState((prev) => (sameCustomer(prev, next) ? prev : next));
  }, []);

  const setAccount = useCallback((next: Account | null) => {
    setAccountState((prev) => (sameAccount(prev, next) ? prev : next));
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setStatus('unauthenticated');
      setCustomer(null);
      setAccount(null);
      return;
    }

    const load = async () => {
      const [{ customer: me }, acct] = await Promise.all([
        api.me(),
        api.myAccount().catch((err) => {
          if (err.status === 404) return null; // no account yet — fine
          throw err;
        }),
      ]);
      setCustomer(me);
      setAccount(acct?.account ?? null);
      setStatus('authenticated');
    };

    try {
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The token is genuinely invalid/expired — sign out and discard it.
        setToken(null);
        setStatus('unauthenticated');
        setCustomer(null);
        setAccount(null);
        return;
      }
      // Transient failure (rate limit, 5xx, network): never treat it as a
      // logout — retry once shortly, and keep the token either way so the
      // next successful load restores the session.
      try {
        await new Promise((r) => setTimeout(r, 3000));
        await load();
      } catch {
        setStatus('unauthenticated');
        setCustomer(null);
        setAccount(null);
      }
    }
  }, [setCustomer, setAccount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      setToken(res.token);
      setCustomer(res.customer);
      setAccount(null);
      setStatus('authenticated');
    },
    [setCustomer, setAccount],
  );

  const register = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => {
      await api.register(input);
      const loginRes = await api.login({ email: input.email, password: input.password });
      setToken(loginRes.token);
      setCustomer(loginRes.customer);
      setStatus('authenticated');
    },
    [setCustomer],
  );

  const logout = useCallback(() => {
    setToken(null);
    setCustomer(null);
    setAccount(null);
    setStatus('unauthenticated');
  }, [setCustomer, setAccount]);

  const value = useMemo(
    () => ({ status, customer, account, login, register, logout, setCustomer, setAccount, refresh }),
    [status, customer, account, login, register, logout, setCustomer, setAccount, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
