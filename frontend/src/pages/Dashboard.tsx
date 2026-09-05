import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, Clock, Eye, EyeOff, RefreshCw, Search, SearchCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { InstallPromptCard } from '../components/InstallPromptCard';
import { NotificationBell } from '../components/NotificationBell';
import { StatusChip } from '../components/StatusChip';
import { ThemeToggle } from '../components/ThemeToggle';
import { toastError, useToast } from '../components/Toast';
import { api, type Account, type TransactionItem } from '../lib/api';
import { formatDate, formatNaira, initials } from '../lib/format';

const PULL_THRESHOLD = 64;
const PULL_MAX = 96;

export function Dashboard() {
  const { customer, account, setAccount } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [balance, setBalance] = useState<Account | null>(account);
  const [hideBalance, setHideBalance] = useState(false);
  const [recent, setRecent] = useState<TransactionItem[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Pull-to-refresh state
  const screenRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ startY: 0, active: false });
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await api.myBalance();
      setBalance(res.account);
      setAccount(res.account);
    } catch (err) {
      toast('error', toastError(err));
    } finally {
      setLoadingBalance(false);
    }
  }, [setAccount, toast]);

  const loadRecent = useCallback(async () => {
    try {
      const res = await api.transactions({ limit: 5 });
      setRecent(res.items);
    } catch {
      // non-fatal
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([loadBalance(), loadRecent()]);
    } finally {
      setRefreshing(false);
      pullRef.current = 0;
      setPull(0);
    }
  }, [loadBalance, loadRecent]);

  // Stable dependency: account?.id (not the account object). loadBalance()
  // calls setAccount() with a fresh object from the API, so depending on the
  // object identity here would re-trigger this effect forever — an infinite
  // fetch loop that burned through the API rate limit. Keyed by id, the
  // refresh runs once per mount (and when a different account appears).
  const accountId = account?.id;
  useEffect(() => {
    if (!accountId) return;
    // Always fetch the live ledger balance when the dashboard mounts, so the
    // cached figure reflects transfers made elsewhere.
    setBalance(account);
    void loadBalance();
    void loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Native (non-passive) touch handlers so preventDefault actually stops the
  // browser's overscroll while the pull indicator is tracking the finger.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;

    const atTop = () => el.scrollTop <= 0 && window.scrollY <= 0;

    const onStart = (e: TouchEvent) => {
      if (atTop()) gesture.current = { startY: e.touches[0].clientY, active: true };
    };

    const onMove = (e: TouchEvent) => {
      if (!gesture.current.active) return;
      const dy = e.touches[0].clientY - gesture.current.startY;
      if (dy <= 0 || !atTop()) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      setDragging(true);
      pullRef.current = Math.min(dy * 0.45, PULL_MAX);
      setPull(pullRef.current);
      if (dy > 8) e.preventDefault();
    };

    const onEnd = () => {
      if (!gesture.current.active) return;
      gesture.current.active = false;
      setDragging(false);
      if (pullRef.current >= PULL_THRESHOLD) {
        void refreshAll();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshAll]);

  const actions = [
    { label: 'Send money', icon: <ArrowLeftRight size={21} />, cls: 'action--send', to: '/send' },
    { label: 'Name enquiry', icon: <SearchCheck size={21} />, cls: 'action--enquiry', to: '/enquiry' },
    { label: 'Tx status', icon: <Clock size={21} />, cls: 'action--status', to: '/status' },
    { label: 'History', icon: <Search size={21} />, cls: 'action--history', to: '/history' },
  ];

  return (
    <div className="screen" ref={screenRef}>
      <div className="ptr">
        <div className={`ptr-body ${dragging ? 'ptr-body--dragging' : ''}`} style={{ transform: `translateY(${refreshing ? PULL_THRESHOLD : pull}px)` }}>
          <div className="topbar">
            <div>
              <h1>Hi, {customer?.firstName} 👋</h1>
              <div className="sub">Welcome back to EgoPay</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NotificationBell />
              <ThemeToggle style={{ width: 40, height: 40 }} />
              <button className="avatar" onClick={() => navigate('/profile')} aria-label="Profile">
                {customer ? initials(customer.firstName, customer.lastName) : 'E'}
              </button>
            </div>
          </div>

          {balance && (
            <div className="card card--balance" style={{ marginBottom: 18 }}>
              <div className="balance-label">
                Available balance
                <button
                  className="icon-btn"
                  style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.22)', color: '#fff', boxShadow: 'none' }}
                  onClick={() => setHideBalance((v) => !v)}
                  aria-label="Toggle balance visibility"
                >
                  {hideBalance ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="balance-amount">{hideBalance ? '₦ ••••••' : formatNaira(balance.balance)}</div>
              <div className="balance-meta">
                <span>
                  {balance.accountNumber} · {balance.bankName || 'EgoPay'}
                </span>
                <button
                  style={{
                    background: 'rgba(255,255,255,0.22)',
                    border: 'none',
                    borderRadius: 999,
                    color: '#fff',
                    width: 34,
                    height: 34,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={loadBalance}
                  disabled={loadingBalance}
                  aria-label="Refresh balance"
                >
                  <RefreshCw size={15} className={loadingBalance ? 'spin-slow' : ''} />
                </button>
              </div>
            </div>
          )}

          <InstallPromptCard />

          <div className="actions">
            {actions.map((a) => (
              <button key={a.label} className={`action ${a.cls}`} onClick={() => navigate(a.to)}>
                <span className="action-icon">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          <div className="section-title">
            Recent transactions
            {recent.length > 0 && (
              <button className="link" onClick={() => navigate('/history')}>
                See all
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="empty-state" style={{ background: 'var(--card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
              <Clock size={40} />
              <h3>No transactions yet</h3>
              <p>Send money to start your transaction history.</p>
            </div>
          ) : (
            <div className="list">
          {recent.map((tx) =>
            tx.direction === 'CREDIT' ? (
              <div key={tx.id} className="list-item">
                <span className="list-item-icon list-item-icon--green">
                  <ArrowDownLeft size={18} />
                </span>
                <div className="list-item-body">
                  <div className="list-item-title">Incoming transfer</div>
                  <div className="list-item-sub">{formatDate(tx.createdAt)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="list-item-amount list-item-amount--plus">+{formatNaira(tx.amount)}</div>
                </div>
              </div>
            ) : (
              <div key={tx.id} className="list-item" onClick={() => navigate(`/history`)}>
                <span className={`list-item-icon ${tx.status === 'SUCCESS' ? 'list-item-icon--green' : tx.status === 'FAILED' ? 'list-item-icon--red' : 'list-item-icon--amber'}`}>
                  <ArrowLeftRight size={18} />
                </span>
                <div className="list-item-body">
                  <div className="list-item-title">{tx.recipientName ?? `To ${tx.to}`}</div>
                  <div className="list-item-sub">{formatDate(tx.createdAt)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="list-item-amount list-item-amount--minus">-{formatNaira(tx.amount)}</div>
                  <StatusChip status={tx.status} />
                </div>
              </div>
            ),
          )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}