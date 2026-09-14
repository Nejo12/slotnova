import { NavLink } from "react-router";

import styles from "./Navigation.module.scss";
import type { NavGroup } from "./nav-items.js";

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles["item"]} ${styles["item-active"]}` : (styles["item"] ?? "");
}

/**
 * Desktop navigation: grouped nav items with a semantic heading per group
 * and `aria-current="page"` (via react-router's NavLink) exposing the
 * current route to assistive tech — not a color-only active indicator.
 */
export function DesktopNavigation({
  groups,
  label,
}: {
  groups: readonly NavGroup[];
  label: string;
}): React.JSX.Element {
  return (
    <nav aria-label={label}>
      {groups.map((group) => (
        <div key={group.label}>
          <p className={styles["group-label"]}>{group.label}</p>
          <ul className={styles["list"]}>
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink to={item.path} className={navLinkClassName} viewTransition>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
