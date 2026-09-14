import { describe, expect, it } from "vitest";

import { assertSlotnovaInput, reconcile, type ReconciledTokens } from "../reconcile.js";
import { renderCss, renderTs } from "../render.js";
import rawSlotnovaInput from "../input/slotnova-tokens.json" with { type: "json" };
import novaTokens from "@nova-component/design-tokens/tokens.json" with { type: "json" };

const slotnovaInput = assertSlotnovaInput(rawSlotnovaInput);

describe("reconcile", () => {
  it("resolves every semantic light token to a concrete value", () => {
    const result = reconcile(novaTokens, slotnovaInput);

    for (const [group, entries] of Object.entries(result.light)) {
      for (const [key, resolved] of Object.entries(entries)) {
        expect(resolved.value, `light.${group}.${key} should resolve`).not.toMatch(/^\{.*\}$/);
        expect(resolved.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every semantic dark token to a concrete value", () => {
    const result = reconcile(novaTokens, slotnovaInput);

    for (const [group, entries] of Object.entries(result.dark)) {
      for (const [key, resolved] of Object.entries(entries)) {
        expect(resolved.value, `dark.${group}.${key} should resolve`).not.toMatch(/^\{.*\}$/);
        expect(resolved.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("produces the same key set for light and dark (theme completeness)", () => {
    const result = reconcile(novaTokens, slotnovaInput);

    const flatten = (mode: ReconciledTokens["light"]) =>
      Object.entries(mode)
        .flatMap(([group, entries]) => Object.keys(entries).map((key) => `${group}.${key}`))
        .sort();

    expect(flatten(result.light)).toEqual(flatten(result.dark));
  });

  it("resolves Recovery/* semantics explicitly in both themes", () => {
    const result = reconcile(novaTokens, slotnovaInput);
    const lightRecovery = result.light["recovery"];
    const darkRecovery = result.dark["recovery"];

    expect(lightRecovery).toBeDefined();
    expect(darkRecovery).toBeDefined();
    expect(Object.keys(lightRecovery ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(darkRecovery ?? {}).length).toBeGreaterThan(0);
    for (const key of Object.keys(lightRecovery ?? {})) {
      expect(darkRecovery?.[key]).toBeDefined();
    }
  });

  it("resolves Appointment/* semantics explicitly in both themes", () => {
    const result = reconcile(novaTokens, slotnovaInput);
    const lightAppointment = result.light["appointment"];
    const darkAppointment = result.dark["appointment"];

    expect(lightAppointment).toBeDefined();
    expect(darkAppointment).toBeDefined();
    expect(Object.keys(lightAppointment ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(darkAppointment ?? {}).length).toBeGreaterThan(0);
    for (const key of Object.keys(lightAppointment ?? {})) {
      expect(darkAppointment?.[key]).toBeDefined();
    }
  });

  it("records a provenance of either nova or slotnova for every resolved token", () => {
    const result = reconcile(novaTokens, slotnovaInput);

    for (const mode of [result.light, result.dark]) {
      for (const entries of Object.values(mode)) {
        for (const resolved of Object.values(entries)) {
          expect(["nova", "slotnova"]).toContain(resolved.source);
        }
      }
    }
  });

  it("throws a clear error on a circular alias", () => {
    const brokenInput: Parameters<typeof reconcile>[1] = {
      semantic: {
        light: {
          broken: {
            a: { value: "{semantic.light.broken.b}", source: "slotnova", provenance: "interim" },
            b: { value: "{semantic.light.broken.a}", source: "slotnova", provenance: "interim" },
          },
        },
        dark: { broken: {} },
      },
      typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
      motion: { duration: {}, easing: {}, spring: {} },
    };

    expect(() => reconcile(novaTokens, brokenInput)).toThrow(/circular/i);
  });

  it("is deterministic: two runs on the same input produce byte-identical CSS and TS", () => {
    const resultA = reconcile(novaTokens, slotnovaInput);
    const resultB = reconcile(novaTokens, slotnovaInput);

    expect(renderCss(resultA)).toBe(renderCss(resultB));
    expect(renderTs(resultA)).toBe(renderTs(resultB));
  });

  it("agrees between generated CSS custom-property names and generated TS token keys", () => {
    const result = reconcile(novaTokens, slotnovaInput);
    const css = renderCss(result);

    const cssVarNames = new Set([...css.matchAll(/--slotnova-([a-z0-9-]+):/g)].map((m) => m[1]));

    const kebab = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

    const flattenTsKeys = (mode: ReconciledTokens["light"]) =>
      Object.entries(mode).flatMap(([group, entries]) =>
        Object.keys(entries).map((key) => `${kebab(group)}-${kebab(key)}`),
      );

    const tsKeysLight = new Set(flattenTsKeys(result.light));

    for (const key of tsKeysLight) {
      expect(cssVarNames.has(key), `missing css var for ${key}`).toBe(true);
    }
    expect(tsKeysLight.size).toBe(cssVarNames.size);
  });

  it("preserves the canonical motion.duration/easing/spring namespace in the resolved tree", () => {
    const result = reconcile(novaTokens, slotnovaInput);

    for (const mode of [result.light, result.dark]) {
      expect(mode["motion-duration"]?.["fast"]).toBeDefined();
      expect(mode["motion-duration"]?.["normal"]).toBeDefined();
      expect(mode["motion-duration"]?.["slow"]).toBeDefined();

      expect(mode["motion-easing"]?.["standard"]).toBeDefined();
      expect(mode["motion-easing"]?.["enter"]).toBeDefined();
      expect(mode["motion-easing"]?.["exit"]).toBeDefined();

      expect(mode["motion-spring"]?.["snappy"]).toBeDefined();
      expect(mode["motion-spring"]?.["gentle"]).toBeDefined();

      // The old flattened group must not exist as the public contract.
      expect(mode["motion"]).toBeUndefined();
    }
  });

  it("emits canonical motion CSS custom-property names, not flattened alternatives", () => {
    const result = reconcile(novaTokens, slotnovaInput);
    const css = renderCss(result);

    expect(css).toContain("--slotnova-motion-duration-fast:");
    expect(css).toContain("--slotnova-motion-duration-normal:");
    expect(css).toContain("--slotnova-motion-duration-slow:");
    expect(css).toContain("--slotnova-motion-easing-standard:");
    expect(css).toContain("--slotnova-motion-easing-enter:");
    expect(css).toContain("--slotnova-motion-easing-exit:");
    expect(css).toContain("--slotnova-motion-spring-snappy:");
    expect(css).toContain("--slotnova-motion-spring-gentle:");

    // Flattened alternatives (from before this fix) must not appear.
    expect(css).not.toMatch(/--slotnova-motion-fast:/);
    expect(css).not.toMatch(/--slotnova-motion-enter:/);
    expect(css).not.toMatch(/--slotnova-motion-snappy:/);
  });

  it("emits canonical motion TypeScript token names, not flattened alternatives", () => {
    const result = reconcile(novaTokens, slotnovaInput);
    const ts = renderTs(result);

    expect(ts).toContain('"motion-duration.fast"');
    expect(ts).toContain('"motion-duration.normal"');
    expect(ts).toContain('"motion-duration.slow"');
    expect(ts).toContain('"motion-easing.standard"');
    expect(ts).toContain('"motion-easing.enter"');
    expect(ts).toContain('"motion-easing.exit"');
    expect(ts).toContain('"motion-spring.snappy"');
    expect(ts).toContain('"motion-spring.gentle"');

    expect(ts).not.toContain('"motion.fast"');
    expect(ts).not.toContain('"motion.enter"');
    expect(ts).not.toContain('"motion.snappy"');
  });
});
