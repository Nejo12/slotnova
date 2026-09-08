/**
 * Denylist-based redaction for structured log/telemetry metadata (FR-057).
 *
 * The application log stream is not the audit trail and must never carry
 * secrets, session material or customer payment data. `redact` returns a
 * defensive deep copy of its input with every value under a sensitive key
 * replaced by the constant {@link REDACTED} marker — secrets are dropped
 * whole, never partially exposed.
 */

/** Constant substituted for every redacted value. Never a truncated secret. */
export const REDACTED = "[REDACTED]";

/** Marker substituted when a circular reference is re-encountered. */
const CIRCULAR = "[CIRCULAR]";

export interface RedactOptions {
  /** Extra sensitive key names (matched with the same normalization rules). */
  readonly additionalKeys?: readonly string[];
  /**
   * Include `Error.stack` in the redacted output. Off by default: stacks can
   * embed uncontrolled request/body data.
   */
  readonly includeErrorStack?: boolean;
}

/** Lowercase a key and strip every non-alphanumeric character. */
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Exact normalized-key matches. */
const EXACT_KEYS: ReadonlySet<string> = new Set([
  "passwd",
  "authorization",
  "cookie",
  "setcookie",
  "cvv",
  "cvc",
  "pan",
  "cardnumber",
]);

/**
 * Normalized suffixes: a key is sensitive when it ends with one of these, so
 * `password`, `userPassword`, `token`, `csrfToken`, `clientSecret`,
 * `x-api-key` and `privateKey` all match without redacting `tokenCount`.
 */
const SENSITIVE_SUFFIXES: readonly string[] = [
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "privatekey",
];

const isSensitiveKey = (key: string, extra: ReadonlySet<string>): boolean => {
  const n = normalizeKey(key);
  if (n === "") return false;
  if (EXACT_KEYS.has(n) || extra.has(n)) return true;
  if (SENSITIVE_SUFFIXES.some((suffix) => n.endsWith(suffix))) return true;
  return false;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Return a redacted deep copy of `value`. The input is never mutated.
 * Circular references are replaced with a deterministic `[CIRCULAR]` marker.
 */
export function redact<T>(value: T, options: RedactOptions = {}): unknown {
  const extraKeys = new Set((options.additionalKeys ?? []).map(normalizeKey));
  const includeErrorStack = options.includeErrorStack ?? false;
  const seen = new WeakSet<object>();

  const walk = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") {
      return typeof node === "function" ? "[FUNCTION]" : node;
    }

    if (seen.has(node)) return CIRCULAR;
    seen.add(node);
    try {
      return walkObject(node);
    } finally {
      // Backtrack so a shared (non-circular) reference used twice as a sibling
      // is still fully redacted, not reported as a cycle.
      seen.delete(node);
    }
  };

  const walkObject = (node: object): unknown => {
    if (node instanceof Error) {
      const base: Record<string, unknown> = { name: node.name, message: node.message };
      if (includeErrorStack && typeof node.stack === "string") base["stack"] = node.stack;
      return base;
    }

    if (node instanceof Date) return node.toISOString();

    if (Array.isArray(node)) return node.map((item) => walk(item));

    if (isPlainRecord(node)) {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        out[key] = isSensitiveKey(key, extraKeys) ? REDACTED : walk(child);
      }
      return out;
    }

    // Unknown object shape (Map, Set, class instance, …): redact own enumerable
    // string keys the same way rather than risk leaking through it.
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key, extraKeys) ? REDACTED : walk(child);
    }
    return out;
  };

  return walk(value);
}
