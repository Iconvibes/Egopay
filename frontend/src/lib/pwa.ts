const ICON = '/icons/icon-192.png';
const INSTALL_DISMISSED_KEY = 'egopay_install_dismissed';

/** Chrome's beforeinstallprompt — not part of the standard DOM lib types. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPromptState = {
  /** True once beforeinstallprompt fired — the browser says the app is installable. */
  canPrompt: boolean;
  /** True when running as an installed app (standalone) or right after install. */
  installed: boolean;
};

type InstallStateListener = (state: InstallPromptState) => void;

/**
 * The deferred beforeinstallprompt event. The spec says prompt() may only be
 * called in response to a user gesture, so we capture the event early and
 * hold it until the in-app "Add EgoPay" card's Install button is tapped.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let trackingStarted = false;
const installListeners = new Set<InstallStateListener>();

function isStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes installed state on navigator.
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function emitInstallState(): void {
  const state = getInstallState();
  for (const l of installListeners) l(state);
}

export function getInstallState(): InstallPromptState {
  return { canPrompt: deferredPrompt !== null, installed };
}

/** Subscribe to install-state changes. Calls the listener immediately. */
export function subscribeInstallState(listener: InstallStateListener): () => void {
  installListeners.add(listener);
  listener(getInstallState());
  return () => {
    installListeners.delete(listener);
  };
}

/**
 * Start listening for installability. Call once at boot.
 *
 * - beforeinstallprompt: preventDefault() suppresses the browser's automatic
 *   install UI so *we* choose when to surface it (the in-app card). The event
 *   is deferred and stored for a later user-gesture prompt().
 * - appinstalled: the app finished installing — the card must never return.
 */
export function initInstallTracking(): void {
  if (typeof window === 'undefined' || trackingStarted) return;
  trackingStarted = true;
  installed = isStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault(); // suppress the default mini-infobar / prompt
    const promptEvent = e as BeforeInstallPromptEvent;
    // Keep the most recent event; a fresh one supersedes a stale deferred one.
    deferredPrompt = promptEvent;
    emitInstallState();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emitInstallState();
  });
}

/** True when the in-app install card should show (installable, not installed, not dismissed). */
export function isInstallCardDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hide the card until the user re-engages (or the storage is cleared). */
export function dismissInstallCard(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // storage unavailable — nothing to persist
  }
}

/**
 * Show the browser's install UI from the deferred prompt (must run inside the
 * Install button's click handler). Returns the user's choice.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return 'unavailable';

  // A deferred prompt can only be used once — clear it up front.
  deferredPrompt = null;
  emitInstallState();
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      installed = true; // appinstalled may lag on some platforms — be safe
      emitInstallState();
      return 'accepted';
    }
    // The user closed the native sheet — don't keep nagging this session.
    dismissInstallCard();
    return 'dismissed';
  } catch {
    return 'unavailable';
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/** Ask the user for notification permission (must be called from a gesture). */
export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Shows an OS-level notification (when permission is granted). Clicking it
 * focuses the app and opens the notifications screen.
 */
export function showPaymentNotification(title: string, body: string, tag: string): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: ICON, badge: ICON });
    n.onclick = () => {
      window.focus();
      window.location.href = '/notifications';
    };
  } catch {
    // Some environments disallow page-originated notifications — ignore.
  }
}

/** Register the offline service worker. Safe to call multiple times. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal (the app works without it).
    });
  });
}