import { describe, expect, it } from "vitest";

import {
  buildInvitation,
  buildMembership,
  buildSession,
  buildUser,
  buildWorkspace,
  buildWorkspaceScenario,
} from "../index.js";

describe("entity builders — valid-by-default", () => {
  it("produce complete, internally-consistent default entities", () => {
    expect(buildWorkspace()).toMatchObject({
      id: "workspace_00000001",
      slug: "acme-studio",
      settings: { theme: "system" },
    });
    expect(buildUser().email).toBe("ada@example.test");
    expect(buildMembership()).toMatchObject({ role: "member", workspaceId: "workspace_00000001" });
    expect(buildSession()).toMatchObject({
      userId: "user_00000001",
      activeWorkspaceId: "workspace_00000001",
    });
    expect(buildInvitation()).toMatchObject({ status: "pending", role: "member" });
  });

  it("keeps session issuedAt strictly before expiresAt", () => {
    const session = buildSession();
    expect(Date.parse(session.issuedAt)).toBeLessThan(Date.parse(session.expiresAt));
  });
});

describe("entity builders — overrides", () => {
  it("apply a shallow patch override", () => {
    expect(buildUser({ displayName: "Grace Hopper" }).displayName).toBe("Grace Hopper");
    expect(buildMembership({ role: "admin" }).role).toBe("admin");
  });

  it("apply a function override that can derive from the defaults", () => {
    const invitation = buildInvitation((defaults) => ({
      ...defaults,
      email: `owner+${defaults.role}@example.test`,
      status: "accepted",
    }));
    expect(invitation.email).toBe("owner+member@example.test");
    expect(invitation.status).toBe("accepted");
  });
});

describe("entity builders — independence / no shared mutable state", () => {
  it("returns a distinct top-level object per call", () => {
    const a = buildWorkspace();
    const b = buildWorkspace();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("returns distinct nested objects per call (no shared reference)", () => {
    const a = buildWorkspace();
    const b = buildWorkspace();
    expect(a.settings).not.toBe(b.settings);

    const mutated = buildWorkspace({ settings: { ...a.settings, theme: "dark" } });
    expect(mutated.settings.theme).toBe("dark");
    expect(buildWorkspace().settings.theme).toBe("system");
  });

  it("does not leak mutations of one built object into later builds", () => {
    const first = buildSession() as unknown as { activeWorkspaceId: string | null };
    first.activeWorkspaceId = null;
    expect(buildSession().activeWorkspaceId).toBe("workspace_00000001");

    const scenario = buildWorkspace() as unknown as { settings: { theme: string } };
    scenario.settings.theme = "dark";
    expect(buildWorkspace().settings.theme).toBe("system");
  });
});

describe("buildWorkspaceScenario — relationship composition", () => {
  it("wires membership, session and invitation to the same workspace and owner", () => {
    const scenario = buildWorkspaceScenario();
    expect(scenario.membership.workspaceId).toBe(scenario.workspace.id);
    expect(scenario.membership.userId).toBe(scenario.owner.id);
    expect(scenario.membership.role).toBe("owner");
    expect(scenario.session.userId).toBe(scenario.owner.id);
    expect(scenario.session.activeWorkspaceId).toBe(scenario.workspace.id);
    expect(scenario.invitation.workspaceId).toBe(scenario.workspace.id);
    expect(scenario.invitation.invitedByUserId).toBe(scenario.owner.id);
  });

  it("re-links relationships after applying entity overrides", () => {
    const scenario = buildWorkspaceScenario({
      workspace: { id: "ws-custom" },
      owner: { id: "user-custom" },
      invitation: { email: "newhire@example.test" },
    });
    expect(scenario.invitation.email).toBe("newhire@example.test");
    expect(scenario.invitation.workspaceId).toBe("ws-custom");
    expect(scenario.invitation.invitedByUserId).toBe("user-custom");
    expect(scenario.session.activeWorkspaceId).toBe("ws-custom");
  });

  it("returns independent graphs on repeated calls", () => {
    const a = buildWorkspaceScenario();
    const b = buildWorkspaceScenario();
    expect(a.workspace).not.toBe(b.workspace);
    expect(a.session).not.toBe(b.session);
    expect(a).toEqual(b);
  });
});
