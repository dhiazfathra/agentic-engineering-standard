// Feature flags: SPEC-design-parity.md § Feature flags. Each flag defaults
// OFF and only turns on when its NEXT_PUBLIC_FLAG_<NAME> env var is exactly
// "1". Next.js inlines NEXT_PUBLIC_ vars only for literal
// `process.env.NEXT_PUBLIC_X` access, so each one is read literally here.

export type Flags = {
  AI_SUMMARY: boolean;
  SIMILAR_MERGE: boolean;
  INTEGRATIONS: boolean;
  BILLING: boolean;
  SDK: boolean;
  CLI_MCP: boolean;
  WEBHOOKS: boolean;
  HELPDESK: boolean;
  SUPPORT_WIDGET: boolean;
  EMAIL: boolean;
  SSO_AUDIT_AUTODEL: boolean;
  EXTERNAL_LINKS: boolean;
};

export function readFlags(env: Record<string, string | undefined>): Flags {
  return {
    AI_SUMMARY: env.NEXT_PUBLIC_FLAG_AI_SUMMARY === "1",
    SIMILAR_MERGE: env.NEXT_PUBLIC_FLAG_SIMILAR_MERGE === "1",
    INTEGRATIONS: env.NEXT_PUBLIC_FLAG_INTEGRATIONS === "1",
    BILLING: env.NEXT_PUBLIC_FLAG_BILLING === "1",
    SDK: env.NEXT_PUBLIC_FLAG_SDK === "1",
    CLI_MCP: env.NEXT_PUBLIC_FLAG_CLI_MCP === "1",
    WEBHOOKS: env.NEXT_PUBLIC_FLAG_WEBHOOKS === "1",
    HELPDESK: env.NEXT_PUBLIC_FLAG_HELPDESK === "1",
    SUPPORT_WIDGET: env.NEXT_PUBLIC_FLAG_SUPPORT_WIDGET === "1",
    EMAIL: env.NEXT_PUBLIC_FLAG_EMAIL === "1",
    SSO_AUDIT_AUTODEL: env.NEXT_PUBLIC_FLAG_SSO_AUDIT_AUTODEL === "1",
    EXTERNAL_LINKS: env.NEXT_PUBLIC_FLAG_EXTERNAL_LINKS === "1",
  };
}

export const flags: Flags = {
  AI_SUMMARY: process.env.NEXT_PUBLIC_FLAG_AI_SUMMARY === "1",
  SIMILAR_MERGE: process.env.NEXT_PUBLIC_FLAG_SIMILAR_MERGE === "1",
  INTEGRATIONS: process.env.NEXT_PUBLIC_FLAG_INTEGRATIONS === "1",
  BILLING: process.env.NEXT_PUBLIC_FLAG_BILLING === "1",
  SDK: process.env.NEXT_PUBLIC_FLAG_SDK === "1",
  CLI_MCP: process.env.NEXT_PUBLIC_FLAG_CLI_MCP === "1",
  WEBHOOKS: process.env.NEXT_PUBLIC_FLAG_WEBHOOKS === "1",
  HELPDESK: process.env.NEXT_PUBLIC_FLAG_HELPDESK === "1",
  SUPPORT_WIDGET: process.env.NEXT_PUBLIC_FLAG_SUPPORT_WIDGET === "1",
  EMAIL: process.env.NEXT_PUBLIC_FLAG_EMAIL === "1",
  SSO_AUDIT_AUTODEL: process.env.NEXT_PUBLIC_FLAG_SSO_AUDIT_AUTODEL === "1",
  EXTERNAL_LINKS: process.env.NEXT_PUBLIC_FLAG_EXTERNAL_LINKS === "1",
};
