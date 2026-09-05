import { useState } from 'react';
import { Banknote, Copy, Landmark, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ThemeToggle } from '../components/ThemeToggle';
import { toastError, useToast } from '../components/Toast';
import { api } from '../lib/api';
import { formatDate, formatNaira, initials } from '../lib/format';

export function Profile() {
  const { customer, account, setAccount, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  async function refreshBalance() {
    if (!account) return;
    setRefreshing(true);
    try {
      const res = await api.myBalance();
      setAccount(res.account);
      toast('success', 'Balance updated');
    } catch (err) {
      toast('error', toastError(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function copyAccount() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      toast('success', 'Account number copied');
    } catch {
      toast('info', account.accountNumber);
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Profile" />

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="avatar" style={{ width: 58, height: 58, fontSize: 21 }}>
          {customer ? initials(customer.firstName, customer.lastName) : 'F'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            {customer?.firstName} {customer?.lastName}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 2 }}>{customer?.email}</div>
          {customer?.phone && <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>{customer.phone}</div>}
        </div>
      </div>

      {account && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              My account
            </div>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={refreshBalance} disabled={refreshing} aria-label="Refresh balance">
              <RefreshCw size={16} className={refreshing ? 'spin-slow' : ''} />
            </button>
          </div>

          <div className="summary-row">
            <span className="k">Account number</span>
            <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {account.accountNumber}
              <button className="dev-toggle" onClick={copyAccount} style={{ display: 'inline-flex' }}>
                <Copy size={13} />
              </button>
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Account name</span>
            <span className="v" style={{ fontSize: 13.5 }}>
              {account.accountName}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Bank</span>
            <span className="v" style={{ fontSize: 13.5 }}>
              {account.bankName || `Bank ${account.bankCode}`}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Balance</span>
            <span className="v" style={{ color: 'var(--primary)' }}>
              {formatNaira(account.balance)}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Opened</span>
            <span className="v" style={{ fontSize: 13 }}>
              {formatDate(account.createdAt)}
            </span>
          </div>
        </div>
      )}

      {customer?.kyc.verified && (
        <div className="card" style={{ background: 'var(--green-soft)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ShieldCheck size={20} color="#00a651" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>Identity verified</div>
              <div style={{ fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
                {customer.kyc.type} {customer.kyc.number ?? ''}
                {customer.kyc.verifiedAt ? ` · verified ${formatDate(customer.kyc.verifiedAt)}` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Appearance</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Switch between light and dark theme</div>
        </div>
        <ThemeToggle />
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--primary-soft)' }}>
        <Landmark size={20} color="#2563eb" />
        <div style={{ flex: 1, fontSize: 13 }}>
          <strong>{account ? 'Powered by NibssByPhoenix' : 'Account not opened yet'}</strong>
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
            {account ? 'Simulated NIBSS settlement network' : 'Complete verification to open your account'}
          </div>
        </div>
        {!account && (
          <button className="btn btn--primary btn--sm" onClick={() => navigate('/create-account')}>
            Open
          </button>
        )}
      </div>

      <button className="btn btn--outline" style={{ color: 'var(--red)', borderColor: 'rgba(229,72,77,0.35)' }} onClick={logout}>
        <LogOut size={17} /> Sign out
      </button>

      <div className="footer-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Banknote size={13} /> EgoPay Digital Bank v1.0 · Simulation only
      </div>
    </div>
  );
}