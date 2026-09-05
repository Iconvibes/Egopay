import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { BottomNav } from './components/BottomNav';
import { PageTransition } from './components/PageTransition';
import { ViewTransitions } from './components/ViewTransitions';
import { Auth } from './pages/Auth';
import { CreateAccount } from './pages/CreateAccount';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Kyc } from './pages/Kyc';
import { NameEnquiry } from './pages/NameEnquiry';
import { Notifications } from './pages/Notifications';
import { Profile } from './pages/Profile';
import { Send } from './pages/Send';
import { TransactionStatus } from './pages/TransactionStatus';

function Splash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={`splash ${leaving ? 'splash--exit' : ''}`}>
      <div className="splash-logo">E</div>
      <div className="splash-name">EgoPay</div>
      <div className="splash-tag">Pay with ease</div>
      <div className="splash-spinner">
        <span className="spinner" />
      </div>
    </div>
  );
}

function useAuthGate() {
  const { status, customer, account } = useAuth();
  if (status === 'loading') return { redirect: <Splash /> };
  if (status === 'unauthenticated') return { redirect: <Navigate to="/login" replace /> };
  return { customer, account };
}

/** KYC screen — reachable only while authenticated and not yet verified. */
function KycRoute() {
  const gate = useAuthGate();
  if ('redirect' in gate) return gate.redirect;
  if (gate.customer!.kyc.verified) {
    return <Navigate to={gate.account ? '/home' : '/create-account'} replace />;
  }
  return (
    <div className="app-shell">
      <PageTransition>
        <Kyc />
      </PageTransition>
    </div>
  );
}

/** Account-opening screen — reachable only after verification, before an account. */
function CreateAccountRoute() {
  const gate = useAuthGate();
  if ('redirect' in gate) return gate.redirect;
  if (!gate.customer!.kyc.verified) return <Navigate to="/kyc" replace />;
  if (gate.account) return <Navigate to="/home" replace />;
  return (
    <div className="app-shell">
      <PageTransition>
        <CreateAccount />
      </PageTransition>
    </div>
  );
}

/** Main app — requires verified KYC and an open account. */
function MainShell({ children }: { children: ReactNode }) {
  const gate = useAuthGate();
  if ('redirect' in gate) return gate.redirect;
  if (!gate.customer!.kyc.verified) return <Navigate to="/kyc" replace />;
  if (!gate.account) return <Navigate to="/create-account" replace />;
  return (
    <div className="app-shell">
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PageTransition>{children}</PageTransition>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  // Branded splash on every full page load: pops in, holds ~1.3s, fades out.
  const [splashPhase, setSplashPhase] = useState<'show' | 'leaving' | 'done'>('show');
  useEffect(() => {
    const t1 = window.setTimeout(() => setSplashPhase('leaving'), 1300);
    const t2 = window.setTimeout(() => setSplashPhase('done'), 1800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (splashPhase !== 'done') return <Splash leaving={splashPhase === 'leaving'} />;

  return (
    <ViewTransitions>
      <Route
        path="/login"
        element={
          <PageTransition>
            <Auth />
          </PageTransition>
        }
      />
      <Route path="/kyc" element={<KycRoute />} />
      <Route path="/create-account" element={<CreateAccountRoute />} />
      <Route
        path="/home"
        element={
          <MainShell>
            <Dashboard />
          </MainShell>
        }
      />
      <Route
        path="/send"
        element={
          <MainShell>
            <Send />
          </MainShell>
        }
      />
      <Route
        path="/enquiry"
        element={
          <MainShell>
            <NameEnquiry />
          </MainShell>
        }
      />
      <Route
        path="/status"
        element={
          <MainShell>
            <TransactionStatus />
          </MainShell>
        }
      />
      <Route
        path="/history"
        element={
          <MainShell>
            <History />
          </MainShell>
        }
      />
      <Route
        path="/profile"
        element={
          <MainShell>
            <Profile />
          </MainShell>
        }
      />
      <Route
        path="/notifications"
        element={
          <MainShell>
            <Notifications />
          </MainShell>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </ViewTransitions>
  );
}