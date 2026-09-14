import { Menu, type MenuItem } from "@slotnova/ui";
import { useNavigate } from "react-router";

import styles from "./MobileShell.module.scss";
import { MOBILE_MORE_NAV } from "./nav-items.js";

/**
 * Mobile "More" destination (T059). Not a route itself — a menu over the
 * remaining product destinations not in the fixed 5-item bottom nav. Uses
 * Nova's `Menu` (same primitive as WorkspaceSwitcher/AccountMenu) rather
 * than inventing a bespoke sheet component.
 */
export function MoreMenu({ isMoreActive }: { isMoreActive: boolean }): React.JSX.Element {
  const navigate = useNavigate();

  const items: MenuItem[] = MOBILE_MORE_NAV.map((item) => ({
    id: item.key,
    label: item.label,
    onSelect: () => navigate(item.path, { viewTransition: true }),
  }));

  return (
    <Menu
      trigger={
        <button
          type="button"
          className={`${styles["bottom-nav-item"]} ${isMoreActive ? styles["bottom-nav-item-active"] : ""}`}
          aria-label="More destinations"
        >
          More
        </button>
      }
      items={items}
      align="end"
    />
  );
}
