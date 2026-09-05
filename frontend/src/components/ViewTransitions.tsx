import { flushSync } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { Routes, useLocation } from 'react-router-dom';

const hasViewTransitions = () =>
  typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Router-level View Transitions. Wraps `<Routes>` and commits every location
 * change inside `document.startViewTransition` (+ flushSync so the new page is
 * painted before the browser snapshots), giving a *true* cross-fade: the old
 * page's snapshot animates out while the new page slides in.
 *
 * - Fires for ANY navigation — Link taps, navigate() calls, <Navigate> guards
 *   and back/forward — because it watches the location, not individual links.
 * - When the API is unavailable, or the user prefers reduced motion, the
 *   location commits instantly and the keyed PageTransition fallback (fade +
 *   slide-up replay) takes over where supported.
 */
export function ViewTransitions({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);

  useEffect(() => {
    // location.key identifies a distinct history entry — same-path navigations
    // (e.g. ?tab= re-visits) still transition, while re-renders do not.
    if (location.key === displayLocation.key) return;

    // Feature + preference are read per navigation so a live change (user
    // toggling "reduce motion", or the API appearing/disappearing) is honored.
    if (!hasViewTransitions() || prefersReducedMotion()) {
      setDisplayLocation(location);
      return;
    }

    let transition: ViewTransition | null = null;
    try {
      // The callback must mutate the DOM synchronously so the browser can
      // snapshot the old page and the freshly committed new page.
      transition = document.startViewTransition(() => {
        flushSync(() => setDisplayLocation(location));
      });
    } catch {
      // Some engines reject edge-case transitions — degrade to a plain commit.
      setDisplayLocation(location);
      return;
    }

    // A rapid second navigation skips this transition; swallow its settle so an
    // abort never surfaces as an unhandled rejection.
    transition.finished.catch(() => {});
  }, [location, displayLocation]);

  // Render <Routes> ourselves (children are <Route> elements) against the
  // display location: during the cross-fade the old page stays mounted while
  // the router's real location advances underneath.
  return (
    <Routes location={displayLocation} key={displayLocation.key}>
      {children}
    </Routes>
  );
}
