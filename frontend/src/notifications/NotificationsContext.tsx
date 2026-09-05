import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, getToken } from '../lib/api';
import { showPaymentNotification } from '../lib/pwa';
import { useToast } from '../components/Toast';

const BASE_DELAY_MS = 15_000; // one request per 15s while idle
const MAX_DELAY_MS = 60_000; // polite backoff when rate-limited / token invalid
const LOGIN_CHECK_MS = 5_000; // re-check for a fresh token after logout

interface NotificationsContextValue {
  /** Number of unread notifications (live, refreshed by the shared poller). */
  unreadCount: number;
  /** Force an immediate refresh (used after read/unread actions). */
  reload: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Single, app-wide notification poller — one `GET /api/notifications?unreadOnly`
 * request per cycle that drives the bell badge, the "You received ₦X" toasts
 * and the OS-level payment alerts together.
 *
 * - Polls only while a token exists (nothing fires on the login screen).
 * - Backs off (doubling up to 60s) when rate-limited or the token is invalid,
 *   so the app throttles itself instead of stacking onto a busy server.
 * - Remount-safe: the seen-set lives at module scope, so navigation never
 *   re-toasts the same payment.
 */
const seen = new Set<string>();
let lastDelay = BASE_DELAY_MS;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const cancelledRef = useRef(false);

  const pollOnce = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      lastDelay = LOGIN_CHECK_MS;
      return;
    }

    try {
      const res = await api.notifications(true);
      lastDelay = BASE_DELAY_MS;
      setUnreadCount(res.unreadCount);
      for (const n of res.items) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        // A failed outgoing transfer is an error toast; everything else (money
        // in, successful send) is a success toast.
        toast(n.kind === 'OUTGOING_FAILED' ? 'error' : 'success', n.message);
        showPaymentNotification(n.title, n.message, n.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.status === 401) lastDelay = Math.min(MAX_DELAY_MS, lastDelay * 2);
      }
    }
  }, [toast]);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: number | undefined;

    const loop = async () => {
      if (cancelledRef.current) return;
      await pollOnce();
      if (!cancelledRef.current) timer = window.setTimeout(() => void loop(), lastDelay);
    };

    void loop();
    return () => {
      cancelledRef.current = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollOnce]);

  const reload = useCallback(async () => {
    await pollOnce();
  }, [pollOnce]);

  const value = useMemo(() => ({ unreadCount, reload }), [unreadCount, reload]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}