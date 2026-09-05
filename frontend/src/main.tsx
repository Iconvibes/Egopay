import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { NotificationsProvider } from './notifications/NotificationsContext';
import { applyTheme, getInitialTheme } from './lib/theme';
import { initInstallTracking, registerServiceWorker } from './lib/pwa';
import './styles.css';

// Apply the persisted/system theme before first paint to avoid a flash.
applyTheme(getInitialTheme());

// PWA: offline service worker (production builds only — the Vite dev server
// serves its own fresh assets and would fight the cache).
if (import.meta.env.PROD) {
  registerServiceWorker();
}

// PWA: capture the browser's installability signal early (beforeinstallprompt)
// so the in-app "Add EgoPay" card can offer installation on our own terms.
initInstallTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <NotificationsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </NotificationsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);