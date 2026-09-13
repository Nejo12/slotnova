import { buildUser } from "@slotnova/testing/builders";
import { describe, expect, it } from "vitest";

import { DevCredentialAdapter, type SeededDevUser } from "../dev-adapter.js";

function seededFromBuilder(override?: Parameters<typeof buildUser>[0]): SeededDevUser {
  const user = buildUser(override);
  return { email: user.email, displayName: user.displayName };
}

describe("DevCredentialAdapter", () => {
  it("verifies a seeded user by email and returns identity-only info", async () => {
    const seeded = seededFromBuilder({ email: "ada@example.test", displayName: "Ada Lovelace" });
    const adapter = new DevCredentialAdapter([seeded]);

    const result = await adapter.verify({ seededUserEmail: "ada@example.test" });

    expect(result).toEqual({
      externalRef: "dev-seed:ada@example.test",
      email: "ada@example.test",
      displayName: "Ada Lovelace",
    });
  });

  it("is case-insensitive on the seeded email", async () => {
    const seeded = seededFromBuilder({ email: "ada@example.test" });
    const adapter = new DevCredentialAdapter([seeded]);

    const result = await adapter.verify({ seededUserEmail: "ADA@EXAMPLE.TEST" });
    expect(result?.email).toEqual("ada@example.test");
  });

  it("rejects an email not in the seeded allowlist", async () => {
    const adapter = new DevCredentialAdapter([seededFromBuilder()]);
    expect(await adapter.verify({ seededUserEmail: "nobody@example.test" })).toBeNull();
  });

  it("rejects a malformed credential payload without throwing", async () => {
    const adapter = new DevCredentialAdapter([seededFromBuilder()]);
    await expect(adapter.verify(null)).resolves.toBeNull();
    await expect(adapter.verify({})).resolves.toBeNull();
    await expect(adapter.verify({ seededUserEmail: "" })).resolves.toBeNull();
    await expect(adapter.verify("not-an-object")).resolves.toBeNull();
  });

  it("never asserts a role or permission -- the result type carries none", async () => {
    const seeded = seededFromBuilder({ email: "role-free@example.test" });
    const adapter = new DevCredentialAdapter([seeded]);
    const result = await adapter.verify({ seededUserEmail: "role-free@example.test" });
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("permissions");
  });

  it("produces a stable, collision-resistant externalRef distinct from any real provider's", async () => {
    const seeded = seededFromBuilder({ email: "stable@example.test" });
    const adapter = new DevCredentialAdapter([seeded]);
    const result = await adapter.verify({ seededUserEmail: "stable@example.test" });
    expect(result?.externalRef).toMatch(/^dev-seed:/);
  });
});
