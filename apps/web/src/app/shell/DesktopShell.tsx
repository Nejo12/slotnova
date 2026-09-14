import { Outlet } from "react-router";

import { AccountMenu } from "./AccountMenu.js";
import styles from "./DesktopShell.module.scss";
import { DESKTOP_NAV_GROUPS } from "./nav-items.js";
import { DesktopNavigation } from "./Navigation.js";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.js";

/**
 * Desktop application shell (T059): fixed sidebar + top bar, following the
 * approved IA from docs/product-handoff.md and the canonical Figma
 * "18 — Prototypes" shell (node 340:4) for proportions/spacing. Product
 * routes render into <Outlet/> as placeholders only (T060).
 */
export function DesktopShell(): React.JSX.Element {
  return (
    <div className={styles["shell"]}>
      <aside className={styles["sidebar"]}>
        <div className={styles["brand"]}>
          <p className={styles["brand-name"]}>Slotnova</p>
          <p className={styles["brand-meta"]}>Business workspace</p>
        </div>
        <WorkspaceSwitcher />
        <DesktopNavigation groups={DESKTOP_NAV_GROUPS} label="Primary" />
      </aside>
      <header className={styles["topbar"]}>
        <AccountMenu />
      </header>
      <main className={styles["main"]}>
        <Outlet />
      </main>
    </div>
  );
}
