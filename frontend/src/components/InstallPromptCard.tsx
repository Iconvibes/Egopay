import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import {
  dismissInstallCard,
  getInstallState,
  isInstallCardDismissed,
  promptInstall,
  subscribeInstallState,
  type InstallPromptState,
} from '../lib/pwa';
import { useToast } from './Toast';

/**
 * In-app \"Add EgoPay to your home screen\" card. The browser's automatic
 * install UI is suppressed in initInstallTracking(); this card is the app's
 * own prompt. It appears only when:
 *   - beforeinstallprompt has fired (the browser really can install the app),
 *   - the app is not already installed / running standalone, and
 *   - the user has not dismissed it before.
 * Tapping Install re-uses the captured deferred event (user gesture → prompt()).
 */
export function InstallPromptCard() {
  const { toast } = useToast();
  const [state, setState] = useState<InstallPromptState>(() => getInstallState());
  const [dismissed, setDismissed] = useState(() => isInstallCardDismissed());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeInstallState(setState), []);

  // Installed while the card was on screen (e.g. via the browser's menu) —
  // stop showing it.
  useEffect(() => {
    if (state.installed) setDismissed(true);
  }, [state.installed]);

  if (dismissed || !state.canPrompt || state.installed) return null;

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') {
      setDismissed(true);
      toast('success', 'EgoPay installed — find it on your home screen.');
    } else if (outcome === 'dismissed') {
      setDismissed(true);
    }
  };

  const dismiss = () => {
    dismissInstallCard();
    setDismissed(true);
  };

  return (
    <div className="install-card" role="region" aria-label="Install EgoPay app">
      <span className="install-logo">E</span>
      <div className="install-body">
        <div className="install-title">Add EgoPay to your home screen</div>
        <div className="install-sub">Faster access, offline balance &amp; payment alerts — just like an app.</div>
      </div>
      <button className="btn btn--primary btn--sm install-btn" onClick={install} disabled={busy}>
        {busy ? (
          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
        ) : (
          <>
            <Download size={15} /> Install
          </>
        )}
      </button>
      <button className="icon-btn install-close" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={15} />
      </button>
    </div>
  );
}
