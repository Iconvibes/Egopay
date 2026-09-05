import { useState, type FormEvent } from 'react';
import { SearchCheck, User2 } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { toastError } from '../components/Toast';
import { api, type Recipient } from '../lib/api';
import { maskAccount, initials } from '../lib/format';

export function NameEnquiry() {
  const [accountNumber, setAccountNumber] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRecipient(null);
    const digits = accountNumber.replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) {
      setError('Account number must be exactly 10 digits.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.nameEnquiry(digits);
      setRecipient(res.recipient);
    } catch (err) {
      setError(toastError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Name enquiry" subtitle="Confirm who you're paying" />

      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field" style={{ marginBottom: 4 }}>
            <label htmlFor="ne-account">Account number</label>
            <div style={{ position: 'relative' }}>
              <User2 size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
              <input
                id="ne-account"
                className="input"
                style={{ paddingLeft: 42, letterSpacing: 1.2 }}
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit NUBAN number"
              />
            </div>
          </div>
        </div>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Look up name'}
        </button>
      </form>

      {recipient && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar" style={{ width: 52, height: 52, fontSize: 19 }}>
              {initials(recipient.accountName.split(' ')[0] ?? 'R', recipient.accountName.split(' ')[1] ?? '')}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Account name
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{recipient.accountName}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {maskAccount(recipient.accountNumber)}
                {recipient.bankCode ? ` · Bank ${recipient.bankCode}` : ''}
              </div>
            </div>
            <SearchCheck size={22} color="#00a651" />
          </div>
        </div>
      )}
    </div>
  );
}