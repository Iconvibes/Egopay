import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, CheckCircle2, SearchCheck, User2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { toastError } from '../components/Toast';
import { api, type Recipient, type TransactionItem } from '../lib/api';
import { formatNaira, maskAccount, initials } from '../lib/format';

type Step = 'recipient' | 'amount' | 'review' | 'processing' | 'done';

export function Send() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('recipient');
  const [accountNumber, setAccountNumber] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [enquiryBusy, setEnquiryBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionItem | null>(null);

  async function handleEnquiry(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const digits = accountNumber.replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) {
      setError('Recipient account must be exactly 10 digits.');
      return;
    }
    setEnquiryBusy(true);
    try {
      const res = await api.nameEnquiry(digits);
      setRecipient(res.recipient);
      setStep('amount');
    } catch (err) {
      setError(toastError(err));
    } finally {
      setEnquiryBusy(false);
    }
  }

  function handleAmountNext(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    if (value > 10_000_000) {
      setError('Amount exceeds the maximum of ₦10,000,000.');
      return;
    }
    setStep('review');
  }

  async function handleConfirm() {
    setError(null);
    if (!recipient) return;
    setSendBusy(true);
    setStep('processing');
    try {
      const res = await api.transfer({ to: recipient.accountNumber, amount: Number(amount), narration: narration.trim() || undefined });
      setResult(res.transaction);
      setStep('done');
    } catch (err) {
      setSendBusy(false);
      setStep('amount');
      setError(toastError(err));
    }
  }

  if (step === 'done' && result) {
    return (
      <div className="screen screen--no-nav">
        <div className="success-screen">
          <div className="success-check">
            <CheckCircle2 size={44} />
          </div>
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Transfer successful</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
            {formatNaira(result.amount)} sent to {result.recipientName ?? result.to}
          </p>

          <div className="card" style={{ width: '100%', textAlign: 'left' }}>
            <div className="summary-row">
              <span className="k">Reference (TSQ)</span>
              <span className="v" style={{ fontSize: 13 }}>
                {result.reference ?? '—'}
              </span>
            </div>
            <div className="summary-row">
              <span className="k">Type</span>
              <span className="v">{result.type === 'INTRABANK' ? 'Intra-bank' : 'Inter-bank'}</span>
            </div>
            <div className="summary-row">
              <span className="k">Status</span>
              <span className="v" style={{ color: 'var(--green)' }}>
                {result.status}
              </span>
            </div>
            <div className="summary-row">
              <span className="k">Narration</span>
              <span className="v" style={{ fontSize: 13 }}>
                {result.narration ?? '—'}
              </span>
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.reference && (
              <button className="btn btn--outline" onClick={() => navigate(`/status?tx=${result.id}`)}>
                Check transaction status
              </button>
            )}
            <button className="btn btn--primary" onClick={() => navigate('/home', { replace: true })}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Send money" subtitle="Recipient is verified before you pay" />

      {error && <div className="alert alert--error">{error}</div>}

      {step === 'recipient' && (
        <form onSubmit={handleEnquiry}>
          <div className="card">
            <div className="field">
              <label htmlFor="to">Recipient account number</label>
              <div style={{ position: 'relative' }}>
                <User2 size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
                <input
                  id="to"
                  className="input"
                  style={{ paddingLeft: 42, letterSpacing: 1.2 }}
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit NUBAN number"
                  autoComplete="off"
                />
              </div>
              <div className="input-hint">
                Works for accounts at any bank — intra-bank and inter-bank.
              </div>
            </div>
          </div>
          <button className="btn btn--primary" disabled={enquiryBusy}>
            {enquiryBusy ? <span className="spinner" /> : 'Verify recipient'}
          </button>
        </form>
      )}

      {step === 'amount' && recipient && (
        <form onSubmit={handleAmountNext}>
          <div className="recipient-card">
            <span className="avatar">{initials(recipient.accountName.split(' ')[0] ?? 'R', recipient.accountName.split(' ')[1] ?? '')}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{recipient.accountName}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {maskAccount(recipient.accountNumber)}
                {recipient.bankName ? ` · ${recipient.bankName}` : recipient.bankCode ? ` · Bank ${recipient.bankCode}` : ''}
              </div>
            </div>
            <SearchCheck size={20} color="#2563eb" />
          </div>

          <div className="card">
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input
                id="amount"
                className="input"
                style={{ fontSize: 22, fontWeight: 700 }}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0.00"
                autoFocus
              />
              <div className="input-hint">Maximum ₦10,000,000 per transfer.</div>
            </div>
            <div className="field" style={{ marginBottom: 4 }}>
              <label htmlFor="narration">Narration (optional)</label>
              <input
                id="narration"
                className="input"
                value={narration}
                onChange={(e) => setNarration(e.target.value.slice(0, 100))}
                placeholder="e.g. lunch money"
              />
            </div>
          </div>

          <button className="btn btn--primary">Continue</button>
        </form>
      )}

      {step === 'review' && recipient && (
        <>
          <div className="recipient-card">
            <span className="avatar">{initials(recipient.accountName.split(' ')[0] ?? 'R', recipient.accountName.split(' ')[1] ?? '')}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{recipient.accountName}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{maskAccount(recipient.accountNumber)}</div>
            </div>
          </div>

          <div className="card">
            <div className="summary-row">
              <span className="k">Amount</span>
              <span className="v" style={{ fontSize: 18, color: 'var(--primary)' }}>
                {formatNaira(Number(amount))}
              </span>
            </div>
            <div className="summary-row">
              <span className="k">Fee</span>
              <span className="v" style={{ color: 'var(--green)' }}>
                ₦0.00
              </span>
            </div>
            <div className="divider" />
            <div className="summary-row">
              <span className="k">Narration</span>
              <span className="v" style={{ fontSize: 13 }}>
                {narration || '—'}
              </span>
            </div>
            <div className="summary-row">
              <span className="k">Transfer type</span>
              <span className="v" style={{ fontSize: 13 }}>
                {account && recipient.bankCode && account.bankCode === recipient.bankCode ? 'Intra-bank' : 'Inter-bank'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn--outline" style={{ width: '35%' }} onClick={() => setStep('amount')}>
              Back
            </button>
            <button className="btn btn--primary" style={{ width: '65%' }} onClick={handleConfirm} disabled={sendBusy}>
              {sendBusy ? <span className="spinner" /> : `Send ${formatNaira(Number(amount))}`}
            </button>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="success-screen">
          <div className="spinner spinner--dark" style={{ width: 44, height: 44, borderWidth: 4 }} />
          <h1 style={{ fontSize: 18, marginTop: 18 }}>Processing your transfer…</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 6 }}>
            Contacting NibssByPhoenix — this takes a few seconds.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 16, color: 'var(--muted)', fontSize: 12.5 }}>
        <ArrowLeftRight size={14} /> Intra-bank and inter-bank supported
      </div>
    </div>
  );
}