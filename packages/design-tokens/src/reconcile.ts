export type ThemeMode = "light" | "dark";

export interface SlotnovaTokenEntry {
  value: string;
  source: "nova" | "slotnova";
  provenance: string;
  figmaVar?: string;
  figmaNode?: string;
  note?: string;
}

export interface ResolvedTokenEntry {
  value: string;
  source: "nova" | "slotnova";
  provenance: string;
}

export type SemanticGroup = Record<string, SlotnovaTokenEntry>;
export type SemanticMode = Record<string, SemanticGroup>;

export interface SlotnovaInput {
  semantic: Record<ThemeMode, SemanticMode>;
  typography: {
    fontFamily: SemanticGroup;
    fontSize: SemanticGroup;
    fontWeight: SemanticGroup;
    lineHeight: SemanticGroup;
  };
  motion: {
    duration: SemanticGroup;
    easing: SemanticGroup;
    spring: SemanticGroup;
  };
}

export interface NovaTokens {
  primitive: Record<string, string>;
  semantic: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

export type ResolvedGroup = Record<string, ResolvedTokenEntry>;
export type ResolvedMode = Record<string, ResolvedGroup>;

export interface ReconciledTokens {
  light: ResolvedMode;
  dark: ResolvedMode;
}

/**
 * `src/input/slotnova-tokens.json` is authored by hand and imported as plain
 * JSON (its `source` field is typed as `string`, not the `"nova"|"slotnova"`
 * literal union). This asserts the file actually conforms to `SlotnovaInput`
 * at the one point it enters the pipeline, rather than casting silently.
 */
export function assertSlotnovaInput(raw: unknown): SlotnovaInput {
  const assertEntry = (path: string, entry: unknown): void => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Token entry at "${path}" is not an object`);
    }
    const value = entry as Record<string, unknown>;
    if (typeof value["value"] !== "string") {
      throw new Error(`Token entry at "${path}" has a non-string "value"`);
    }
    if (value["source"] !== "nova" && value["source"] !== "slotnova") {
      throw new Error(
        `Token entry at "${path}" has an invalid "source": ${String(value["source"])}`,
      );
    }
    if (typeof value["provenance"] !== "string") {
      throw new Error(`Token entry at "${path}" has a non-string "provenance"`);
    }
  };

  const assertGroup = (path: string, group: unknown): void => {
    if (typeof group !== "object" || group === null) {
      throw new Error(`Group at "${path}" is not an object`);
    }
    for (const [key, entry] of Object.entries(group)) {
      assertEntry(`${path}.${key}`, entry);
    }
  };

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Slotnova token input is not an object");
  }
  const input = raw as Record<string, unknown>;

  const semantic = input["semantic"];
  if (typeof semantic !== "object" || semantic === null) {
    throw new Error('Slotnova token input is missing "semantic"');
  }
  for (const mode of ["light", "dark"] as const) {
    const modeGroups = (semantic as Record<string, unknown>)[mode];
    if (typeof modeGroups !== "object" || modeGroups === null) {
      throw new Error(`Slotnova token input is missing "semantic.${mode}"`);
    }
    for (const [groupName, group] of Object.entries(modeGroups)) {
      assertGroup(`semantic.${mode}.${groupName}`, group);
    }
  }

  const typography = input["typography"];
  if (typeof typography !== "object" || typography === null) {
    throw new Error('Slotnova token input is missing "typography"');
  }
  for (const groupName of ["fontFamily", "fontSize", "fontWeight", "lineHeight"] as const) {
    assertGroup(`typography.${groupName}`, (typography as Record<string, unknown>)[groupName]);
  }

  const motion = input["motion"];
  if (typeof motion !== "object" || motion === null) {
    throw new Error('Slotnova token input is missing "motion"');
  }
  for (const groupName of ["duration", "easing", "spring"] as const) {
    assertGroup(`motion.${groupName}`, (motion as Record<string, unknown>)[groupName]);
  }

  return raw as SlotnovaInput;
}

const ALIAS_PATTERN = /^\{([a-zA-Z0-9_.-]+)\}$/;

function lookupNova(novaTokens: NovaTokens, mode: ThemeMode, path: string): string | undefined {
  // path shape: "nova.color.bgPage" | "nova.elevation.surface" | "nova.duration.fast" | "nova.easing.standard"
  const segments = path.split(".");
  if (segments[0] !== "nova") return undefined;
  const key = segments.slice(1).join(".");

  if (key.startsWith("color.") || key.startsWith("elevation.")) {
    return novaTokens.semantic[mode][key];
  }
  // duration/easing/space/radius/shadow/z/control live only in `primitive`
  return novaTokens.primitive[key];
}

function alias(match: RegExpExecArray): string {
  const captured = match[1];
  if (captured === undefined) {
    throw new Error(`Alias pattern matched without a capture group for "${match[0]}"`);
  }
  return captured;
}

/**
 * Resolves every entry of a single theme mode's semantic groups as one flat
 * dependency graph, so an alias may reference any entry (same group, a
 * different group, or a Nova primitive/semantic value) regardless of object
 * key order, while a genuine circular reference is detected and reported.
 */
function resolveMode(groups: SemanticMode, novaTokens: NovaTokens, mode: ThemeMode): ResolvedGroup {
  const flatEntries = new Map<string, SlotnovaTokenEntry>();
  for (const [groupName, group] of Object.entries(groups)) {
    for (const [key, entry] of Object.entries(group)) {
      flatEntries.set(`${groupName}.${key}`, entry);
    }
  }

  const resolvedValues = new Map<string, string>();
  const visiting = new Set<string>();

  function resolvePath(path: string): string {
    const cached = resolvedValues.get(path);
    if (cached !== undefined) return cached;

    const entry = flatEntries.get(path);
    if (!entry) {
      throw new Error(`Unresolved semantic alias "semantic.${mode}.${path}" — no such token`);
    }

    if (visiting.has(path)) {
      const cycle = [...visiting, path].join(" -> ");
      throw new Error(`Circular alias detected while resolving semantic.${mode}: ${cycle}`);
    }
    visiting.add(path);

    const match = ALIAS_PATTERN.exec(entry.value);
    let value: string;
    if (!match) {
      value = entry.value;
    } else {
      const aliasPath = alias(match);
      if (aliasPath.startsWith("nova.")) {
        const novaValue = lookupNova(novaTokens, mode, aliasPath);
        if (novaValue === undefined) {
          throw new Error(
            `Unresolved Nova alias "${aliasPath}" referenced by "semantic.${mode}.${path}"`,
          );
        }
        value = novaValue;
      } else if (aliasPath.startsWith("semantic.")) {
        const segments = aliasPath.split(".");
        const aliasMode = segments[1];
        const rest = segments.slice(2);
        if (aliasMode !== mode) {
          throw new Error(
            `Alias "${aliasPath}" referenced by "semantic.${mode}.${path}" crosses theme modes (${mode} -> ${String(aliasMode)}), which is not supported`,
          );
        }
        value = resolvePath(rest.join("."));
      } else {
        throw new Error(
          `Unrecognized alias "${aliasPath}" referenced by "semantic.${mode}.${path}"`,
        );
      }
    }

    visiting.delete(path);
    resolvedValues.set(path, value);
    return value;
  }

  const out: ResolvedGroup = {};
  for (const path of flatEntries.keys()) {
    const entry = flatEntries.get(path)!;
    out[path] = { value: resolvePath(path), source: entry.source, provenance: entry.provenance };
  }
  return out;
}

function unflattenToGroups(flat: ResolvedGroup): ResolvedMode {
  const out: ResolvedMode = {};
  for (const [path, resolved] of Object.entries(flat)) {
    const dot = path.indexOf(".");
    const group = path.slice(0, dot);
    const key = path.slice(dot + 1);
    const existing = out[group] ?? {};
    existing[key] = resolved;
    out[group] = existing;
  }
  return out;
}

function resolveFlatWithNova(
  group: SemanticGroup,
  groupPrefix: string,
  novaTokens: NovaTokens,
  mode: ThemeMode,
): ResolvedGroup {
  const out: ResolvedGroup = {};
  for (const [key, entry] of Object.entries(group)) {
    const match = ALIAS_PATTERN.exec(entry.value);
    let value: string;
    if (!match) {
      value = entry.value;
    } else {
      const aliasPath = alias(match);
      if (aliasPath.startsWith("nova.")) {
        const novaValue = lookupNova(novaTokens, mode, aliasPath);
        if (novaValue === undefined) {
          throw new Error(
            `Unresolved Nova alias "${aliasPath}" referenced by "${groupPrefix}.${key}"`,
          );
        }
        value = novaValue;
      } else {
        throw new Error(`Unrecognized alias "${aliasPath}" referenced by "${groupPrefix}.${key}"`);
      }
    }
    out[key] = { value, source: entry.source, provenance: entry.provenance };
  }
  return out;
}

function resolveFlatLiteral(group: SemanticGroup): ResolvedGroup {
  const out: ResolvedGroup = {};
  for (const [key, entry] of Object.entries(group)) {
    out[key] = { value: entry.value, source: entry.source, provenance: entry.provenance };
  }
  return out;
}

export function reconcile(novaTokens: NovaTokens, input: SlotnovaInput): ReconciledTokens {
  const light = unflattenToGroups(resolveMode(input.semantic.light, novaTokens, "light"));
  const dark = unflattenToGroups(resolveMode(input.semantic.dark, novaTokens, "dark"));

  // Typography has no Nova equivalent to alias against — literal values only.
  const typography: ResolvedGroup = {
    ...resolveFlatLiteral(input.typography.fontFamily),
    ...resolveFlatLiteral(input.typography.fontSize),
    ...resolveFlatLiteral(input.typography.fontWeight),
    ...resolveFlatLiteral(input.typography.lineHeight),
  };
  light["typography"] = typography;
  dark["typography"] = typography;

  // Each motion category keeps its own canonical namespace
  // (motion.duration.*, motion.easing.*, motion.spring.* per
  // docs/standards/motion.md) rather than flattening into one "motion"
  // group — duration.fast and easing.enter are not the same axis and must
  // not collide or be indistinguishable in the generated output.
  const motionDuration = resolveFlatWithNova(
    input.motion.duration,
    "motion.duration",
    novaTokens,
    "light",
  );
  const motionEasing = resolveFlatWithNova(
    input.motion.easing,
    "motion.easing",
    novaTokens,
    "light",
  );
  const motionSpring = resolveFlatWithNova(
    input.motion.spring,
    "motion.spring",
    novaTokens,
    "light",
  );

  for (const mode of [light, dark]) {
    mode["motion-duration"] = motionDuration;
    mode["motion-easing"] = motionEasing;
    mode["motion-spring"] = motionSpring;
  }

  return { light, dark };
}
