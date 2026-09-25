/**
 * The library sidebar's "Get started" checklist. Pure so it can be unit
 * tested without mounting the component; SPEC-design-parity.md § Screens
 * lists three checks as always real, plus a 4th "integration connected"
 * check once chunk 7's `INTEGRATIONS`-flagged routes exist — included
 * only when that flag is on, same as the nav item and settings tab.
 */
export type GetStartedCheck = {
  key: "extension" | "firstRewind" | "invite" | "integration";
  label: string;
  done: boolean;
};

export function getStartedChecks(input: {
  hasRewinds: boolean;
  usedExtension: boolean;
  invitesSent: boolean;
  integrationsEnabled?: boolean;
  hasIntegration?: boolean;
}): GetStartedCheck[] {
  return [
    {
      key: "extension",
      label: "Install the Rewind extension",
      done: input.usedExtension,
    },
    {
      key: "firstRewind",
      label: "Capture your first Rewind",
      done: input.hasRewinds,
    },
    {
      key: "invite",
      label: "Invite your team",
      done: input.invitesSent,
    },
    ...(input.integrationsEnabled
      ? [
          {
            key: "integration" as const,
            label: "Connect an integration",
            done: Boolean(input.hasIntegration),
          },
        ]
      : []),
  ];
}

/** How many of the checks are done, for the ring's label and dash offset. */
export function getStartedProgress(checks: GetStartedCheck[]): {
  done: number;
  total: number;
} {
  return {
    done: checks.filter((c) => c.done).length,
    total: checks.length,
  };
}
