import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { useSession } from "../auth/use-session.js";
import { MOBILE_MORE_NAV, MOBILE_PRIMARY_NAV } from "./nav-items.js";
import styles from "./MobileShell.module.scss";
import { MoreMenu } from "./MoreMenu.js";

function bottomNavItemClassName({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${styles["bottom-nav-item"]} ${styles["bottom-nav-item-active"]}`
    : (styles["bottom-nav-item"] ?? "");
}

/**
 * Mobile application shell (T059). Primary navigation is fixed to exactly
 * Home · Calendar · Clients · Recovery · More (hard product invariant,
 * AGENTS.md) — a deliberate substitution for the desktop sidebar, not a
 * compressed version of it. The fixed bottom nav reserves its own height
 * in the main content's padding (MobileShell.module.scss) so it never
 * covers content or primary actions.
 */
export function MobileShell(): React.JSX.Element {
  const { activeWorkspace } = useSession();
  const location = useLocation();

  const isMoreActive = useMemo(
    () => MOBILE_MORE_NAV.some((item) => item.path === location.pathname),
    [location.pathname],
  );

  return (
    <div className={styles["shell"]}>
      <header className={styles["topbar"]}>
        <p className={styles["workspace-name"]}>{activeWorkspace?.name ?? "Slotnova"}</p>
      </header>
      <main className={styles["main"]}>
        <Outlet />
      </main>
      <nav className={styles["bottom-nav"]} aria-label="Primary">
        {MOBILE_PRIMARY_NAV.map((item) => (
          <NavLink key={item.key} to={item.path} className={bottomNavItemClassName} viewTransition>
            {item.label}
          </NavLink>
        ))}
        <MoreMenu isMoreActive={isMoreActive} />
      </nav>
    </div>
  );
}
