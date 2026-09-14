import type { ReconciledTokens, ResolvedMode } from "./reconcile.js";

function toCssVarName(group: string, key: string): string {
  const kebab = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `--slotnova-${kebab(group)}-${kebab(key)}`;
}

const SHORTENABLE_HEX = /#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3(?:([0-9a-fA-F])\4)?\b/g;

/**
 * Normalizes CSS output to match this repo's Stylelint baseline
 * (`stylelint-config-standard-scss`) so the generated file — which must
 * never be hand-edited (ADR-022) — passes lint as emitted: shorthand hex
 * where every channel pair repeats, and percentage alpha notation for
 * `rgb(... / <alpha>)`. Purely syntactic; never changes the resolved color.
 */
function normalizeCssValue(value: string): string {
  let normalized = value.replace(SHORTENABLE_HEX, (_match, r, g, b, a: string | undefined) =>
    a === undefined ? `#${r}${g}${b}` : `#${r}${g}${b}${a}`,
  );
  normalized = normalized.replace(/\/\s*([01](?:\.\d+)?)\s*\)/g, (_match, alpha: string) => {
    const percent = Math.round(Number(alpha) * 100);
    return `/ ${percent}%)`;
  });
  return normalized;
}

function sortedEntries(mode: ResolvedMode): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  for (const [group, entries] of Object.entries(mode).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [key, resolved] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
      rows.push([group, key, resolved.value]);
    }
  }
  return rows;
}

function renderThemeBlock(selector: string, mode: ResolvedMode): string {
  const lines = sortedEntries(mode).map(
    ([group, key, value]) => `  ${toCssVarName(group, key)}: ${normalizeCssValue(value)};`,
  );
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export function renderCss(tokens: ReconciledTokens): string {
  const header =
    "/**\n" +
    " * GENERATED FILE — do not hand-edit.\n" +
    " * Produced by `pnpm tokens:generate` from src/input/slotnova-tokens.json\n" +
    " * reconciled against @nova-component/design-tokens (ADR-022, ADR-025).\n" +
    " */\n\n";

  const light = renderThemeBlock(':root, :root[data-theme="light"]', tokens.light);
  const dark = renderThemeBlock(':root[data-theme="dark"]', tokens.dark);

  return `${header}${light}\n\n${dark}\n`;
}

function toTsKey(group: string, key: string): string {
  return `${group}.${key}`;
}

function renderModeObject(mode: ResolvedMode): string {
  const sortedGroups = Object.entries(mode).sort(([a], [b]) => a.localeCompare(b));
  const groupBlocks = sortedGroups.map(([group, groupEntries]) => {
    const sortedKeys = Object.entries(groupEntries).sort(([a], [b]) => a.localeCompare(b));
    const entries = sortedKeys.map(
      ([key, resolved]) => `    ${JSON.stringify(key)}: ${JSON.stringify(resolved.value)},`,
    );
    return `  ${JSON.stringify(group)}: {\n${entries.join("\n")}\n  },`;
  });
  return `{\n${groupBlocks.join("\n")}\n}`;
}

export function renderTs(tokens: ReconciledTokens): string {
  const header =
    "/**\n" +
    " * GENERATED FILE — do not hand-edit.\n" +
    " * Produced by `pnpm tokens:generate` from src/input/slotnova-tokens.json\n" +
    " * reconciled against @nova-component/design-tokens (ADR-022, ADR-025).\n" +
    " */\n\n";

  const lightObj = renderModeObject(tokens.light);
  const darkObj = renderModeObject(tokens.dark);

  const allKeys = new Set<string>();
  for (const mode of [tokens.light, tokens.dark]) {
    for (const [group, entries] of Object.entries(mode)) {
      for (const key of Object.keys(entries)) {
        allKeys.add(toTsKey(group, key));
      }
    }
  }
  const tokenNameUnion = [...allKeys]
    .sort()
    .map((name) => JSON.stringify(name))
    .join(" | ");

  return (
    `${header}` +
    `export const tokens = {\n` +
    `  light: ${lightObj.replace(/\n/g, "\n  ")},\n` +
    `  dark: ${darkObj.replace(/\n/g, "\n  ")},\n` +
    `} as const;\n\n` +
    `export type ThemeMode = "light" | "dark";\n` +
    `export type TokenName = ${tokenNameUnion};\n`
  );
}
