import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

interface Nav { path: string; search: string; navId: number; go: (url: string, replace?: boolean) => void }
const Ctx = createContext<Nav | null>(null);

/**
 * Routage minimal par l'historique du navigateur. Chaque navigation recrée
 * l'écran (navId), comme le chargement d'une page de l'application actuelle :
 * données relues, focus initial rejoué.
 */
export function Router({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => ({ path: location.pathname, search: location.search, navId: 0 }));
  useEffect(() => {
    const onPop = () => setState(s => ({ path: location.pathname, search: location.search, navId: s.navId + 1 }));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((url: string, replace = false) => {
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    scrollTo(0, 0);
    setState(s => ({ path: location.pathname, search: location.search, navId: s.navId + 1 }));
  }, []);
  const value = useMemo(() => ({ ...state, go }), [state, go]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(Ctx);
  if (!nav) throw new Error('Router manquant');
  return nav;
}

/** Lien ordinaire (clic droit, nouvel onglet) qui navigue sans recharger. */
export function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { go } = useNav();
  return (
    <a
      {...rest}
      href={href}
      onClick={e => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href);
      }}
    >
      {children}
    </a>
  );
}
