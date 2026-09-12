/**
 * The single override mechanism shared by every builder (task T017).
 *
 * An override is either a shallow patch object or a function that receives the
 * valid-by-default value and returns a new one. Function overrides are what make
 * relationship composition possible (derive one field from another entity).
 */
export type Override<T> = Partial<T> | ((defaults: T) => T);

export function applyOverride<T>(defaults: T, override?: Override<T>): T {
  if (override === undefined) return defaults;
  if (typeof override === "function") return override(defaults);
  return { ...defaults, ...override };
}
