import { notFound, redirect } from "next/navigation";
import { getPageSession, publicUser } from "@/lib/auth";
import { flags, type Flags } from "@/lib/flags";
import { listIntegrations } from "@/lib/integrations";
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
  "integrations",
  "sdk",
  "mcp",
  "cli",
  "webhooks",
  "account",
  "notifications",
]);

const FLAG_FOR_TAB: Partial<Record<SettingsTab, keyof Flags>> = {
  billing: "BILLING",
  integrations: "INTEGRATIONS",
  sdk: "SDK",
  mcp: "CLI_MCP",
  cli: "CLI_MCP",
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

  const [members, usage, logoUrl, avatarUrl, connectedIntegrations] =
    await Promise.all([
      listMembers(session.workspace.id),
      getUsage(session.workspace.id),
      session.workspace.logoKey ? mediaUrl(session.workspace.logoKey) : null,
      session.user.avatarKey ? mediaUrl(session.user.avatarKey) : null,
      flags.INTEGRATIONS ? listIntegrations(session.workspace.id) : [],
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
      connectedIntegrations={connectedIntegrations}
    />
  );
}
