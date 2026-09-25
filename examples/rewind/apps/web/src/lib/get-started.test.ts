import { describe, expect, it } from "vitest";
import { getStartedChecks, getStartedProgress } from "./get-started";

describe("getStartedChecks", () => {
  it("marks every check todo when nothing has happened yet", () => {
    const checks = getStartedChecks({
      hasRewinds: false,
      usedExtension: false,
      invitesSent: false,
    });
    expect(checks.every((c) => !c.done)).toBe(true);
    expect(checks.map((c) => c.key)).toEqual([
      "extension",
      "firstRewind",
      "invite",
    ]);
  });

  it("marks each check done from its own real signal", () => {
    const checks = getStartedChecks({
      hasRewinds: true,
      usedExtension: true,
      invitesSent: true,
    });
    expect(checks.every((c) => c.done)).toBe(true);
  });

  it("keeps checks independent of one another", () => {
    const checks = getStartedChecks({
      hasRewinds: true,
      usedExtension: false,
      invitesSent: false,
    });
    expect(checks.find((c) => c.key === "firstRewind")!.done).toBe(true);
    expect(checks.find((c) => c.key === "extension")!.done).toBe(false);
    expect(checks.find((c) => c.key === "invite")!.done).toBe(false);
  });
});

describe("integration check", () => {
  it("is omitted when integrations are not enabled", () => {
    const checks = getStartedChecks({
      hasRewinds: false,
      usedExtension: false,
      invitesSent: false,
    });
    expect(checks.find((c) => c.key === "integration")).toBeUndefined();
  });

  it("is included and todo when integrations are enabled but none connected", () => {
    const checks = getStartedChecks({
      hasRewinds: false,
      usedExtension: false,
      invitesSent: false,
      integrationsEnabled: true,
    });
    expect(checks.find((c) => c.key === "integration")!.done).toBe(false);
  });

  it("is done once an integration is connected", () => {
    const checks = getStartedChecks({
      hasRewinds: false,
      usedExtension: false,
      invitesSent: false,
      integrationsEnabled: true,
      hasIntegration: true,
    });
    expect(checks.find((c) => c.key === "integration")!.done).toBe(true);
  });
});

describe("getStartedProgress", () => {
  it("counts done against total", () => {
    const checks = getStartedChecks({
      hasRewinds: true,
      usedExtension: false,
      invitesSent: false,
    });
    expect(getStartedProgress(checks)).toEqual({ done: 1, total: 3 });
  });

  it("is 0 of total when nothing is done", () => {
    const checks = getStartedChecks({
      hasRewinds: false,
      usedExtension: false,
      invitesSent: false,
    });
    expect(getStartedProgress(checks)).toEqual({ done: 0, total: 3 });
  });
});
