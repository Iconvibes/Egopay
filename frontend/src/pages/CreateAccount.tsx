import { useState } from 'react';
import { Banknote, Landmark, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { toastError, useToast } from '../components/Toast';
import { api } from '../lib/api';

export function CreateAccount() {
  const { setAccount, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.createAccount();
      setAccount(res.account);
      toast('success', `Account opened — ₦15,000 welcome credit added`);
      await refresh();
      navigate('/home', { replace: true });
    } catch (err) {
      setError(toastError(err));
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--no-nav">
      <ScreenHeader title="Open your account" subtitle="You're almost there" />

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--balance" style={{ marginBottom: 16 }}>
        <div className="balance-label">
          <Landmark size={15} /> Welcome credit
        </div>
        <div className="balance-amount" style={{ fontSize: 30 }}>
          ₦15,000
        </div>
        <div className="balance-meta">
          <span>Funded instantly</span>
          <Banknote size={18} />
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <ShieldCheck size={22} color="#00a651" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            Your identity has been verified. EgoPay will create your account through NibssByPhoenix and credit it with
            <strong> ₦15,000</strong> so you can start testing transfers right away.
          </div>
        </div>

        <div className="summary-row">
          <span className="k">Account type</span>
          <span className="v">Personal savings</span>
        </div>
        <div className="summary-row">
          <span className="k">Currency</span>
          <span className="v">NGN (₦)</span>
        </div>
        <div className="summary-row">
          <span className="k">Opening credit</span>
          <span className="v" style={{ color: 'var(--green)' }}>
            ₦15,000.00
          </span>
        </div>
        <div className="summary-row">
          <span className="k">One account per customer</span>
          <span className="v">Yes</span>
        </div>
      </div>

      <button className="btn btn--primary" onClick={handleCreate} disabled={busy}>
        {busy ? <span className="spinner" /> : 'Create my account'}
      </button>
    </div>
  );
}