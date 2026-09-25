import { notFound, redirect } from "next/navigation";
import { getPageSession, publicUser } from "@/lib/auth";
import { flags, type Flags } from "@/lib/flags";
import { listMembers } from "@/lib/members";
import { mediaUrl } from "@/lib/storage";
import { getUsage } from "@/lib/usage";
import { SettingsPage, type SettingsTab } from "./settings";

// Workspace and member data can change between requests, so the page
// always reads current rows.
export const dynamic = "force-dynamic";

const BUILT_TABS = new Set<SettingsTab>([
  "general",
  "members",
  "billing",
  "webhooks",
  "account",
  "notifications",
]);

// Integrations, Rewind SDK, MCP and CLI are chunk 7's flagged screens
// (SPEC-design-parity.md § Build order); their routes 404 until then,
// same as a built tab whose flag is off.
const FLAG_FOR_TAB: Partial<Record<SettingsTab, keyof Flags>> = {
  billing: "BILLING",
  webhooks: "WEBHOOKS",
};

type Params = { params: Promise<{ tab: string }> };

export default async function Settings({ params }: Params) {
  const session = await getPageSession();
  if (!session) redirect("/login");

  const { tab: rawTab } = await params;
  const tab = rawTab as SettingsTab;
  if (!BUILT_TABS.has(tab)) notFound();
  const flagName = FLAG_FOR_TAB[tab];
  if (flagName && !flags[flagName]) notFound();

  const [members, usage, logoUrl, avatarUrl] = await Promise.all([
    listMembers(session.workspace.id),
    getUsage(session.workspace.id),
    session.workspace.logoKey ? mediaUrl(session.workspace.logoKey) : null,
    session.user.avatarKey ? mediaUrl(session.user.avatarKey) : null,
  ]);

  return (
    <SettingsPage
      tab={tab}
      user={publicUser(session.user)}
      workspace={session.workspace}
      role={session.membership.role}
      members={members}
      usage={usage}
      logoUrl={logoUrl}
      avatarUrl={avatarUrl}
    />
  );
}
