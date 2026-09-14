import { Menu, type MenuItem } from "@slotnova/ui";
import { useCallback } from "react";
import { useNavigate } from "react-router";

import { useLogout } from "../auth/use-logout.js";
import { useSession } from "../auth/use-session.js";
import { useTheme } from "../providers/theme-context.js";
import { ROUTES } from "../routes/routes.js";
import styles from "./AccountMenu.module.scss";

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

/**
 * Account menu (T059). Sign-out uses the existing revoke-server-session
 * endpoint (contracts/session.contract.md) via `useLogout`, which only
 * clears the TanStack Query cache once the server confirms revocation —
 * never a client-only fake logout. Theme toggle lives here as the shell's
 * one user-facing Light/Dark control (T061).
 */
export function AccountMenu(): React.JSX.Element | null {
  const { me } = useSession();
  const logout = useLogout();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = useCallback(() => {
    logout.mutate(undefined, {
      onSuccess: () => navigate(ROUTES.home),
    });
  }, [logout, navigate]);

  if (!me) return null;

  const items: MenuItem[] = [
    {
      id: "theme",
      label: theme === "light" ? "Switch to Dark theme" : "Switch to Light theme",
      onSelect: toggleTheme,
    },
    {
      id: "sign-out",
      label: "Sign out",
      onSelect: handleSignOut,
      disabled: logout.isPending,
      tone: "danger",
    },
  ];

  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${me.user.displayName}`}
          className={styles["trigger"]}
        >
          {initialsFor(me.user.displayName)}
        </button>
      }
      items={items}
      align="end"
    />
  );
}
