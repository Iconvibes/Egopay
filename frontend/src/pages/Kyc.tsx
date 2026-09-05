import { useState, type FormEvent } from 'react';
import { Fingerprint, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { toastError, useToast } from '../components/Toast';
import { api } from '../lib/api';

type KycMode = 'BVN' | 'NIN';

const DEMO_KYC_ENABLED = import.meta.env.PROD || import.meta.env.VITE_DEMO_KYC_ENABLED === 'true';

export function Kyc() {
  const { setCustomer, refresh } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<KycMode>('BVN');
  const [number, setNumber] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const digits = number.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits)) {
      setError('The number must be exactly 11 digits.');
      return;
    }
    if (!dob) {
      setError('Please enter your date of birth.');
      return;
    }

    setBusy(true);
    try {
      const res = mode === 'BVN' ? await api.verifyBvn({ bvn: digits, dob }) : await api.verifyNin({ nin: digits, dob });
      setCustomer(res.customer);
      toast('success', `${mode} verified successfully`);
      await refresh();
    } catch (err) {
      setError(toastError(err));
    } finally {
      setBusy(false);
    }
  }

  async function useTestIdentity() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'BVN') {
        const res = await api.demoBvn();
        setNumber(res.identity.number);
        setDob(res.identity.dob);
      } else {
        const res = await api.demoNin();
        setNumber(res.identity.number);
        setDob(res.identity.dob);
      }
      toast('success', `Test ${mode} created and loaded.`);
    } catch (err) {
      setError(toastError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--no-nav">
      <ScreenHeader title="Verify your identity" subtitle="Required to open your account" />

      <div className="card card--soft" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <ShieldCheck size={22} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          EgoPay verifies your identity with the NIBSS identity store before opening an account. Your number is
          checked against your registered details and <strong>masked</strong> after verification.
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="segmented">
        <button className={mode === 'BVN' ? 'active' : ''} onClick={() => setMode('BVN')}>
          BVN
        </button>
        <button className={mode === 'NIN' ? 'active' : ''} onClick={() => setMode('NIN')}>
          NIN
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field">
            <label htmlFor="kycNumber">{mode === 'BVN' ? 'Bank Verification Number (BVN)' : 'National Identification Number (NIN)'}</label>
            <div style={{ position: 'relative' }}>
              <Fingerprint size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
              <input
                id="kycNumber"
                className="input"
                style={{ paddingLeft: 42, letterSpacing: 1.5 }}
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="11-digit number"
                autoComplete="off"
              />
            </div>
            <div className="input-hint">Use the 11-digit {mode} registered on your profile.</div>
          </div>

          <div className="field" style={{ marginBottom: 4 }}>
            <label htmlFor="dob">Date of birth</label>
            <input id="dob" type="date" className="input" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            <div className="input-hint">Must match the date on your {mode} record.</div>
          </div>
        </div>

        <button className="btn btn--primary" disabled={busy} type="submit">
          {busy ? <span className="spinner" /> : `Verify ${mode}`}
        </button>
      </form>

      {DEMO_KYC_ENABLED && (
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button className="dev-toggle" onClick={useTestIdentity} disabled={busy}>
            <Sparkles size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            Create a demo {mode}
          </button>
          <div className="input-hint" style={{ marginTop: 8 }}>
            No {mode}? Create a synthetic sandbox identity for this demo.
          </div>
        </div>
      )}

      <div className="footer-note">Demo environment — synthetic test data only</div>
    </div>
  );
}