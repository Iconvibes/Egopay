import { useState, type FormEvent } from 'react';
import { Lock, Mail, Phone, User2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { toastError } from '../components/Toast';

type Mode = 'login' | 'register';

export function Auth() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Email and password are required.');
      return;
    }
    if (mode === 'register') {
      if (firstName.trim().length < 2 || lastName.trim().length < 2) {
        setFormError('First and last names are required.');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
        });
      }
      navigate('/home', { replace: true });
    } catch (err) {
      setFormError(toastError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-logo">E</div>
        <h1>EgoPay</h1>
        <p>Pay with ease</p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        {formError && <div className="alert alert--error">{formError}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="firstName">First name</label>
                <div style={{ position: 'relative' }}>
                  <User2 size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
                  <input
                    id="firstName"
                    className="input"
                    style={{ paddingLeft: 42 }}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ada"
                    autoComplete="given-name"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lastName">Last name</label>
                <div style={{ position: 'relative' }}>
                  <User2 size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
                  <input
                    id="lastName"
                    className="input"
                    style={{ paddingLeft: 42 }}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Okafor"
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="email">Email address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
              <input
                id="email"
                type="email"
                className="input"
                style={{ paddingLeft: 42 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="field">
              <label htmlFor="phone">Phone (optional)</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
                <input
                  id="phone"
                  className="input"
                  style={{ paddingLeft: 42 }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08012345678"
                  autoComplete="tel"
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="#8b8b92" style={{ position: 'absolute', left: 14, top: 15 }} />
              <input
                id="password"
                type="password"
                className="input"
                style={{ paddingLeft: 42 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {mode === 'register' && <div className="input-hint">Use 8+ characters with letters and numbers.</div>}
          </div>

          <button className="btn btn--primary" disabled={busy} type="submit">
            {busy ? <span className="spinner" /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-link">
          {mode === 'login' ? 'New to EgoPay? ' : 'Already have an account? '}
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </div>

        <div className="footer-note">Demo bank — simulated NIBSS integration · No real money</div>
      </div>
    </div>
  );
}