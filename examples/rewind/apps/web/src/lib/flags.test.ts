import { describe, expect, it } from "vitest";
import { readFlags, type Flags } from "./flags";

const NAMES: (keyof Flags)[] = [
  "AI_SUMMARY",
  "SIMILAR_MERGE",
  "INTEGRATIONS",
  "BILLING",
  "SDK",
  "CLI_MCP",
  "WEBHOOKS",
  "HELPDESK",
  "SUPPORT_WIDGET",
  "EMAIL",
  "SSO_AUDIT_AUTODEL",
  "EXTERNAL_LINKS",
];

describe("readFlags", () => {
  it("defaults every flag to off when no env vars are set", () => {
    const flags = readFlags({});
    for (const name of NAMES) {
      expect(flags[name]).toBe(false);
    }
  });

  it("turns a flag on only when its var is exactly \"1\"", () => {
    for (const name of NAMES) {
      const on = readFlags({ [`NEXT_PUBLIC_FLAG_${name}`]: "1" });
      expect(on[name]).toBe(true);
    }
  });

  it("keeps a flag off for any value other than \"1\"", () => {
    for (const name of NAMES) {
      const off = readFlags({ [`NEXT_PUBLIC_FLAG_${name}`]: "0" });
      expect(off[name]).toBe(false);
      const truthy = readFlags({ [`NEXT_PUBLIC_FLAG_${name}`]: "true" });
      expect(truthy[name]).toBe(false);
    }
  });

  it("does not turn on other flags when one is set", () => {
    const flags = readFlags({ NEXT_PUBLIC_FLAG_BILLING: "1" });
    for (const name of NAMES) {
      if (name === "BILLING") continue;
      expect(flags[name]).toBe(false);
    }
  });
});
