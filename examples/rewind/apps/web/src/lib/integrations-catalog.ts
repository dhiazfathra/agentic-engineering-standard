/**
 * The `INTEGRATIONS`-flagged catalog (SPEC-design-parity.md § Feature
 * flags): "No OAuth with Linear, Jira, GitHub or the rest. Connect state
 * is stored, nothing sent." `id` is the `integrations.name` column value.
 *
 * Split from `lib/integrations.ts` so client components (the Integrations
 * settings tab) can import the catalog without pulling in the `db` module.
 */
export type IntegrationDef = {
  id: string;
  name: string;
  initial: string;
  color: string;
  description: string;
};

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    id: "Linear",
    name: "Linear",
    initial: "L",
    color: "#5e6ad2",
    description: "Send a Rewind to Linear as an issue.",
  },
  {
    id: "Jira",
    name: "Jira",
    initial: "J",
    color: "#0052cc",
    description: "Send a Rewind to Jira as an issue.",
  },
  {
    id: "GitHub",
    name: "GitHub",
    initial: "G",
    color: "#24292e",
    description: "Send a Rewind to GitHub as an issue.",
  },
  {
    id: "Slack",
    name: "Slack",
    initial: "S",
    color: "#4a154b",
    description: "Post new Rewinds to a Slack channel.",
  },
];

export const INTEGRATION_IDS = new Set(INTEGRATION_CATALOG.map((i) => i.id));
