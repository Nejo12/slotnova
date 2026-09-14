import { RequireSession } from "../auth/RequireSession.js";
import { DesktopShell } from "./DesktopShell.js";
import { MobileShell } from "./MobileShell.js";
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from "./use-media-query.js";

/**
 * Top-level shell layout route (T058/T059). Gates on session (server-
 * authoritative, GET /v1/me) before rendering either shell, then picks
 * Desktop or Mobile by viewport — a deliberate substitution decided at
 * render time, not a CSS-only compression of one layout into the other.
 */
export function ShellLayout(): React.JSX.Element {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);

  return <RequireSession>{isMobile ? <MobileShell /> : <DesktopShell />}</RequireSession>;
}
