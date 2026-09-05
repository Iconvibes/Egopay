import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

const hasViewTransitions = () =>
  typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

/**
 * Wraps routed page content with a keyed mount, so every route change replays
 * the enter animation (fade + slide-up — same easing family as the splash).
 *
 * Only the changing page content animates: the app shell, bottom nav and
 * notification poller live outside this wrapper and stay mounted, so their
 * state (and the seen-alerts set) survives navigation.
 *
 * When the View Transitions API is available this wrapper is neutral: the
 * router-level ViewTransitions layer cross-fades the outgoing page with the
 * incoming one, and replaying the keyed animation here would double-animate.
 * Browsers without the API keep this keyed replay as their transition.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (hasViewTransitions()) return <>{children}</>;
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
