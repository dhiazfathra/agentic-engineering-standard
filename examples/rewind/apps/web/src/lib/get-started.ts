/**
 * The library sidebar's "Get started" checklist. Pure so it can be unit
 * tested without mounting the component; SPEC-design-parity.md § Screens
 * lists exactly these three checks as real (a fourth, integration
 * connected, is deferred: it needs the `INTEGRATIONS`-flagged routes that
 * chunk 7 adds).
 */
export type GetStartedCheck = {
  key: "extension" | "firstRewind" | "invite";
  label: string;
  done: boolean;
};

export function getStartedChecks(input: {
  hasRewinds: boolean;
  usedExtension: boolean;
  invitesSent: boolean;
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
