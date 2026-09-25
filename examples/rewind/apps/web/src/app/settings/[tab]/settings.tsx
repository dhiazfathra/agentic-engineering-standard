"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { publicUser } from "@/lib/auth";
import {
  defaultLinkAccess,
  type DefaultLinkAccess,
  membershipRole,
  type MembershipRole,
  userRole,
  type UserRole,
  type workspaces,
} from "@/db/schema";
import { flags, type Flags } from "@/lib/flags";
import { INTEGRATION_CATALOG } from "@/lib/integrations-catalog";
import type { MemberListItem } from "@/lib/members";
import { applyTheme, setTheme } from "@/lib/theme";
import type { Usage } from "@/lib/usage";
import { initials } from "@/lib/viewer";
import { ToastStack, useToast } from "@/components/toast";
import styles from "./settings.module.css";

export type SettingsTab =
  | "general"
  | "members"
  | "billing"
  | "integrations"
  | "sdk"
  | "mcp"
  | "cli"
  | "webhooks"
  | "account"
  | "notifications";

type Workspace = typeof workspaces.$inferSelect;
type User = ReturnType<typeof publicUser>;

type Props = {
  tab: SettingsTab;
  user: User;
  workspace: Workspace;
  role: MembershipRole;
  members: MemberListItem[];
  usage: Usage;
  logoUrl: string | null;
  avatarUrl: string | null;
  connectedIntegrations: string[];
};

type NavItem = { tab: SettingsTab; label: string; flag?: keyof Flags };
type NavGroup = { title: string; items: NavItem[] };

const NOTIF_LABELS: [keyof User & `notifyN${number}`, string][] = [
  ["notifyN1", "New Rewind assigned to you"],
  ["notifyN2", "Comment on a Rewind you're watching"],
  ["notifyN3", "Status change on a Rewind you reported"],
  ["notifyN4", "Weekly workspace digest"],
  ["notifyN5", "Someone joins your workspace"],
];

async function patchJson(
  url: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function SettingsPage({
  tab,
  user: initialUser,
  workspace: initialWorkspace,
  role,
  members,
  usage,
  logoUrl,
  avatarUrl,
  connectedIntegrations,
}: Props) {
  const router = useRouter();
  const { toasts, showToast, undo, close } = useToast();
  const [user, setUser] = useState(initialUser);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [savingWs, setSavingWs] = useState<string | null>(null);
  const [savingMe, setSavingMe] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("Viewer");
  const [invitingSaving, setInvitingSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [connected, setConnected] = useState(connectedIntegrations);
  const [integrationBusy, setIntegrationBusy] = useState<string | null>(null);

  async function toggleIntegration(id: string, connect: boolean) {
    setIntegrationBusy(id);
    try {
      const res = await fetch(`/api/integrations/${id}`, {
        method: connect ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error("failed");
      setConnected((c) =>
        connect ? [...c, id] : c.filter((name) => name !== id),
      );
    } catch {
      showToast(`Couldn't ${connect ? "connect" : "disconnect"} ${id}`, "error");
    } finally {
      setIntegrationBusy(null);
    }
  }

  const isAdmin = role === "Admin";
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  async function saveWorkspace<K extends keyof Workspace>(
    field: K,
    value: Workspace[K],
    label: string,
  ) {
    const previous = workspace[field];
    setWorkspace((w) => ({ ...w, [field]: value }));
    setSavingWs(field as string);
    try {
      const res = await patchJson("/api/workspace", { [field]: value });
      if (!res.ok) throw new Error("failed");
    } catch {
      setWorkspace((w) => ({ ...w, [field]: previous }));
      showToast(`Couldn't save ${label}`, "error");
    } finally {
      setSavingWs(null);
    }
  }

  async function saveMe<K extends keyof User>(
    field: K,
    value: User[K],
    label: string,
  ) {
    const previous = user[field];
    setUser((u) => ({ ...u, [field]: value }));
    setSavingMe(field as string);
    try {
      const res = await patchJson("/api/me", { [field]: value });
      if (!res.ok) throw new Error("failed");
    } catch {
      setUser((u) => ({ ...u, [field]: previous }));
      showToast(`Couldn't save ${label}`, "error");
    } finally {
      setSavingMe(null);
    }
  }

  async function resetInviteCode() {
    try {
      const res = await fetch("/api/workspace/invite-code/reset", {
        method: "POST",
      });
      if (!res.ok) throw new Error("failed");
      const row = (await res.json()) as Workspace;
      setWorkspace(row);
      showToast("Invite link reset");
    } catch {
      showToast("Couldn't reset the invite link", "error");
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/team-invite/${workspace.inviteCode}`,
      );
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy link", "error");
    }
  }

  async function sendInvite() {
    const emails = inviteEmails.split(/[\s,]+/).filter(Boolean);
    if (emails.length === 0) return;
    setInvitingSaving(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, role: inviteRole }),
      });
      if (!res.ok) throw new Error("failed");
      showToast(emails.length > 1 ? "Invites sent" : "Invite sent");
      setInviteEmails("");
      setInviteOpen(false);
    } catch {
      showToast("Couldn't send that invite", "error");
    } finally {
      setInvitingSaving(false);
    }
  }

  async function changeMemberRole(userId: string, newRole: MembershipRole) {
    try {
      const res = await patchJson(`/api/members/${userId}`, {
        role: newRole,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        showToast(body?.error ?? "Couldn't change that member's role", "error");
        return;
      }
      router.refresh();
    } catch {
      showToast("Couldn't change that member's role", "error");
    }
  }

  async function removeMember(userId: string) {
    try {
      const res = await fetch(`/api/members/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        showToast(body?.error ?? "Couldn't remove that member", "error");
        return;
      }
      showToast("Member removed");
      router.refresh();
    } catch {
      showToast("Couldn't remove that member", "error");
    }
  }

  async function uploadFile(file: File, kind: "avatar" | "logo") {
    const presignUrl = kind === "avatar" ? "/api/me/avatar" : "/api/workspace/logo";
    try {
      const presign = await fetch(presignUrl, {
        method: kind === "avatar" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!presign.ok) throw new Error("presign failed");
      const { url, key } = (await presign.json()) as { url: string; key: string };
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("upload failed");
      if (kind === "avatar") {
        await saveMe("avatarKey" as keyof User, key as User[keyof User], "photo");
        showToast("Profile picture uploaded");
      } else {
        await saveWorkspace("logoKey", key, "logo");
        showToast("Workspace logo uploaded");
      }
      router.refresh();
    } catch {
      showToast(
        kind === "avatar" ? "Couldn't upload that photo" : "Couldn't upload that logo",
        "error",
      );
    }
  }

  async function removeAvatar() {
    await saveMe("avatarKey" as keyof User, null as User[keyof User], "photo");
    showToast("Profile picture removed");
    router.refresh();
  }

  async function deleteAccount() {
    if (!confirm("Delete your account? This can't be undone.")) return;
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      // Full reload, not router.push: the session cookie is gone and every
      // client store (toasts, workspace state) must reset.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard reload after account deletion
      location.assign("/login");
    } catch {
      showToast("Couldn't delete your account", "error");
      setDeletingAccount(false);
    }
  }

  async function turnOffAllNotifications() {
    const previous = user;
    setUser((u) => ({
      ...u,
      notifyN1: false,
      notifyN2: false,
      notifyN3: false,
      notifyN4: false,
      notifyN5: false,
    }));
    try {
      const res = await patchJson("/api/me", {
        notifyN1: false,
        notifyN2: false,
        notifyN3: false,
        notifyN4: false,
        notifyN5: false,
      });
      if (!res.ok) throw new Error("failed");
      showToast("Email notifications turned off");
    } catch {
      setUser(previous);
      showToast("Couldn't turn off notifications", "error");
    }
  }

  const NAV: NavGroup[] = [
    {
      title: "Workspace",
      items: [
        { tab: "general", label: "General" },
        { tab: "members", label: "Members" },
        { tab: "billing", label: "Billing", flag: "BILLING" },
      ],
    },
    {
      title: "Apps & tools",
      items: [
        { tab: "integrations", label: "Integrations", flag: "INTEGRATIONS" },
        { tab: "sdk", label: "Rewind SDK", flag: "SDK" },
        { tab: "mcp", label: "MCP", flag: "CLI_MCP" },
        { tab: "cli", label: "CLI", flag: "CLI_MCP" },
        { tab: "webhooks", label: "Webhooks", flag: "WEBHOOKS" },
      ],
    },
    {
      title: "Account",
      items: [
        { tab: "account", label: fullName || "Account" },
        { tab: "notifications", label: "Notifications" },
      ],
    },
  ];

  const titles: Record<SettingsTab, string> = {
    general: "General",
    members: "Members",
    billing: "Billing",
    integrations: "Integrations",
    sdk: "Rewind SDK",
    mcp: "MCP",
    cli: "CLI",
    webhooks: "Webhooks",
    account: fullName || "Account",
    notifications: "Notifications",
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.back}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to app
        </Link>
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.flag || flags[i.flag]);
          if (items.length === 0) return null;
          return (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navTitle}>{group.title}</div>
              {items.map((item) => (
                <Link
                  key={item.tab}
                  href={`/settings/${item.tab}`}
                  className={
                    item.tab === tab
                      ? `${styles.navItem} ${styles.navItemActive}`
                      : styles.navItem
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <div className={styles.content}>
        <h1 className={styles.header}>{titles[tab]}</h1>
        <div className={styles.body}>
          <div className={styles.section}>
            {tab === "general" && (
              <GeneralTab
                workspace={workspace}
                logoUrl={logoUrl}
                isAdmin={isAdmin}
                saving={savingWs}
                onName={(v) => saveWorkspace("name", v, "workspace name")}
                onLogo={(f) => uploadFile(f, "logo")}
                onDefaultLinkAccess={(v) =>
                  saveWorkspace("defaultLinkAccess", v, "default link access")
                }
                onSso={
                  flags.BILLING
                    ? () => setPricingOpen(true)
                    : (v) => saveWorkspace("ssoEnabled", v, "single sign-on")
                }
                onAi={(v) => saveWorkspace("aiEnabled", v, "AI")}
                onAutoDelete={(v) =>
                  saveWorkspace("autoDelete", v, "auto-delete")
                }
                onAuditLogs={(v) =>
                  saveWorkspace("auditLogs", v, "audit logs")
                }
              />
            )}
            {tab === "members" && (
              <MembersTab
                workspace={workspace}
                members={members}
                isAdmin={isAdmin}
                currentUserId={user.id}
                inviteOpen={inviteOpen}
                inviteEmails={inviteEmails}
                inviteRole={inviteRole}
                invitingSaving={invitingSaving}
                onToggleInviteLink={(v) =>
                  saveWorkspace("inviteLinkEnabled", v, "invite link")
                }
                onResetLink={resetInviteCode}
                onCopyLink={copyInviteLink}
                onToggleRestrict={(v) =>
                  saveWorkspace("restrictInvites", v, "restrict invite access")
                }
                onOpenInvite={() => setInviteOpen(true)}
                onCloseInvite={() => setInviteOpen(false)}
                onInviteEmailsChange={setInviteEmails}
                onInviteRoleChange={setInviteRole}
                onSendInvite={sendInvite}
                onChangeRole={changeMemberRole}
                onRemove={removeMember}
              />
            )}
            {tab === "billing" && (
              <BillingTab
                usage={usage}
                onUpgrade={
                  flags.BILLING
                    ? () => setPricingOpen(true)
                    : () => showToast("Pricing isn't set up yet")
                }
              />
            )}
            {tab === "integrations" && (
              <IntegrationsTab
                connected={connected}
                busy={integrationBusy}
                onToggle={toggleIntegration}
              />
            )}
            {tab === "sdk" && (
              <SdkTab
                onVerify={() => showToast("No recording detected yet")}
                onCopy={() => showToast("Copied")}
              />
            )}
            {tab === "mcp" && (
              <McpTab onNotice={(message) => showToast(message)} />
            )}
            {tab === "cli" && <CliTab onCopy={() => showToast("Copied")} />}
            {tab === "webhooks" && (
              <WebhooksTab
                onSetUp={() => showToast("Webhooks aren't set up yet")}
              />
            )}
            {tab === "account" && (
              <AccountTab
                user={user}
                avatarUrl={avatarUrl}
                saving={savingMe}
                deletingAccount={deletingAccount}
                onAvatar={(f) => uploadFile(f, "avatar")}
                onRemoveAvatar={removeAvatar}
                onFirstName={(v) => saveMe("firstName", v, "first name")}
                onLastName={(v) => saveMe("lastName", v, "last name")}
                onRole={(v) => saveMe("role", v, "role")}
                onTheme={(dark) => {
                  applyTheme(dark);
                  setTheme(dark);
                  void saveMe("theme", dark ? "dark" : "light", "appearance");
                }}
                onDelete={deleteAccount}
              />
            )}
            {tab === "notifications" && (
              <NotificationsTab
                user={user}
                onToggle={(field, value) =>
                  saveMe(field, value as User[typeof field], "notifications")
                }
                onTurnOffAll={turnOffAllNotifications}
              />
            )}
          </div>
        </div>
      </div>
      {pricingOpen && <PricingOverlay onClose={() => setPricingOpen(false)} />}
      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
    </div>
  );
}

function PricingOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.pricingOverlay}>
      <button type="button" className={styles.secondaryButton} onClick={onClose}>
        Close
      </button>
      <h2 className={styles.pricingTitle}>Upgrade your plan</h2>
      <div className={styles.pricingPlans}>
        <div className={styles.planBox}>
          <div className={styles.planName}>Free</div>
          <div className={styles.hint}>30 Rewinds and core features</div>
          <div className={styles.planFeatures}>
            <span>30 Rewinds</span>
            <span>5 recording links</span>
            <span>20 members</span>
          </div>
        </div>
        <div className={`${styles.planBox} ${styles.planBoxFeatured}`}>
          <div className={styles.planName}>Team</div>
          <div className={styles.hint}>Unlimited Rewinds and AI features</div>
          <div className={styles.planFeatures}>
            <span>Unlimited Rewinds</span>
            <span>200 AI summaries</span>
            <span>Single sign-on</span>
            <span>Audit logs and auto-delete</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

function GeneralTab({
  workspace,
  logoUrl,
  isAdmin,
  saving,
  onName,
  onLogo,
  onDefaultLinkAccess,
  onSso,
  onAi,
  onAutoDelete,
  onAuditLogs,
}: {
  workspace: Workspace;
  logoUrl: string | null;
  isAdmin: boolean;
  saving: string | null;
  onName: (v: string) => void;
  onLogo: (f: File) => void;
  onDefaultLinkAccess: (v: DefaultLinkAccess) => void;
  onSso: (v: boolean) => void;
  onAi: (v: boolean) => void;
  onAutoDelete: (v: boolean) => void;
  onAuditLogs: (v: boolean) => void;
}) {
  const [name, setName] = useState(workspace.name);
  // Resyncs after a revert (a failed save restores workspace.name) or a
  // switch to a different workspace, per React's "adjusting state during
  // render" pattern (setState here is not an effect).
  const [syncedName, setSyncedName] = useState(workspace.name);
  if (workspace.name !== syncedName) {
    setSyncedName(workspace.name);
    setName(workspace.name);
  }
  return (
    <>
      <div className={styles.row}>
        <label className={styles.logo} title="Change workspace logo">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned MinIO URL, not a static asset
            <img src={logoUrl} alt="" className={styles.logoImg} />
          ) : (
            <span className={styles.logoFallback}>{initials(workspace.name)}</span>
          )}
          <input
            type="file"
            accept="image/*"
            disabled={!isAdmin}
            className={styles.fileInput}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onLogo(f);
            }}
          />
        </label>
        <div className={styles.field}>
          <label htmlFor="ws-name">Workspace name</label>
          <input
            id="ws-name"
            value={name}
            disabled={!isAdmin}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== workspace.name && onName(name.trim())}
          />
        </div>
      </div>
      <div className={styles.divider} />
      <div className={styles.subheading}>Access</div>
      {flags.SSO_AUDIT_AUTODEL && (
        <div className={styles.settingRow}>
          <div className={styles.flex1}>
            <div className={styles.label}>
              Single sign-on <span className={styles.badge}>Enterprise</span>
            </div>
            <div className={styles.hint}>
              Authenticate with your organization&apos;s identity provider
            </div>
          </div>
          <Toggle
            on={workspace.ssoEnabled}
            onChange={onSso}
            disabled={!isAdmin}
            label="Single sign-on"
          />
        </div>
      )}
      <div className={styles.settingRow}>
        <div className={styles.flex1}>
          <div className={styles.label}>Default link access</div>
          <div className={styles.hint}>
            Who can open links to Rewinds in this workspace
          </div>
        </div>
        <select
          id="ws-default-link-access"
          aria-label="Default link access"
          className={styles.select}
          value={workspace.defaultLinkAccess}
          disabled={!isAdmin}
          onChange={(e) => onDefaultLinkAccess(e.target.value as DefaultLinkAccess)}
        >
          {defaultLinkAccess.map((v) => (
            <option key={v} value={v}>
              {v === "anyone"
                ? "Anyone with the link"
                : v === "members"
                  ? "Workspace members"
                  : "Only invited people"}
            </option>
          ))}
        </select>
      </div>
      {(flags.AI_SUMMARY || flags.SSO_AUDIT_AUTODEL) && (
        <>
          <div className={styles.divider} />
          <div className={styles.subheading}>Data</div>
          {flags.AI_SUMMARY && (
            <div className={styles.settingRow}>
              <div className={styles.flex1}>
                <div className={styles.label}>AI</div>
                <div className={styles.hint}>
                  Generate summaries, repro steps and duplicate grouping
                </div>
              </div>
              <Toggle
                on={workspace.aiEnabled}
                onChange={onAi}
            disabled={!isAdmin}
                label="AI"
              />
            </div>
          )}
          {flags.SSO_AUDIT_AUTODEL && (
            <div className={styles.settingRow}>
              <div className={styles.flex1}>
                <div className={styles.label}>Auto-delete old Rewinds</div>
                <div className={styles.hint}>Delete Rewinds after 90 days</div>
              </div>
              <Toggle
                on={workspace.autoDelete}
                onChange={onAutoDelete}
            disabled={!isAdmin}
                label="Auto-delete old Rewinds"
              />
            </div>
          )}
          {flags.SSO_AUDIT_AUTODEL && (
            <div className={styles.settingRow}>
              <div className={styles.flex1}>
                <div className={styles.label}>Audit logs</div>
                <div className={styles.hint}>
                  Record every action taken by workspace members
                </div>
              </div>
              <Toggle
                on={workspace.auditLogs}
                onChange={onAuditLogs}
            disabled={!isAdmin}
                label="Audit logs"
              />
            </div>
          )}
        </>
      )}
      {saving && <span className={styles.savingHint}>Saving…</span>}
    </>
  );
}

function MembersTab({
  workspace,
  members,
  isAdmin,
  currentUserId,
  inviteOpen,
  inviteEmails,
  inviteRole,
  invitingSaving,
  onToggleInviteLink,
  onResetLink,
  onCopyLink,
  onToggleRestrict,
  onOpenInvite,
  onCloseInvite,
  onInviteEmailsChange,
  onInviteRoleChange,
  onSendInvite,
  onChangeRole,
  onRemove,
}: {
  workspace: Workspace;
  members: MemberListItem[];
  isAdmin: boolean;
  currentUserId: string;
  inviteOpen: boolean;
  inviteEmails: string;
  inviteRole: MembershipRole;
  invitingSaving: boolean;
  onToggleInviteLink: (v: boolean) => void;
  onResetLink: () => void;
  onCopyLink: () => void;
  onToggleRestrict: (v: boolean) => void;
  onOpenInvite: () => void;
  onCloseInvite: () => void;
  onInviteEmailsChange: (v: string) => void;
  onInviteRoleChange: (v: MembershipRole) => void;
  onSendInvite: () => void;
  onChangeRole: (userId: string, role: MembershipRole) => void;
  onRemove: (userId: string) => void;
}) {
  return (
    <>
      <div className={styles.settingRow}>
        <div className={styles.flex1}>
          <div className={styles.label}>Invite link</div>
          <div className={styles.hint}>
            Let teammates join with a shareable link
          </div>
        </div>
        <Toggle
          on={workspace.inviteLinkEnabled}
          onChange={onToggleInviteLink}
            disabled={!isAdmin}
          label="Invite link"
        />
      </div>
      {workspace.inviteLinkEnabled && (
        <div className={styles.inviteLinkBox}>
          <div className={styles.linkRow}>
            <div className={styles.linkText}>
              {`${typeof location === "undefined" ? "" : location.origin}/team-invite/${workspace.inviteCode}`}
            </div>
            <button type="button" onClick={onCopyLink} className={styles.secondaryButton}>
              Copy link
            </button>
          </div>
          {isAdmin && (
            <div className={styles.hint}>
              New members join as Viewer.{" "}
              <a onClick={onResetLink} role="button" tabIndex={0}>
                Reset link
              </a>
            </div>
          )}
        </div>
      )}
      <div className={styles.settingRow}>
        <div className={styles.flex1}>
          <div className={styles.label}>Restrict invite access</div>
          <div className={styles.hint}>Only admins can invite new members</div>
        </div>
        <Toggle
          on={workspace.restrictInvites}
          onChange={onToggleRestrict}
            disabled={!isAdmin}
          label="Restrict invite access"
        />
      </div>
      <div className={styles.settingRow}>
        <div className={styles.flex1}>
          <div className={styles.label}>Members</div>
          <div className={styles.hint}>{members.length} members</div>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onOpenInvite}>
          + Add members
        </button>
      </div>
      {inviteOpen && (
        <div className={styles.inviteForm}>
          <input
            autoFocus
            placeholder="Separate emails with a space"
            value={inviteEmails}
            onChange={(e) => onInviteEmailsChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSendInvite()}
          />
          <select
            value={inviteRole}
            onChange={(e) => onInviteRoleChange(e.target.value as MembershipRole)}
          >
            {membershipRole.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={invitingSaving || !inviteEmails.trim()}
            onClick={onSendInvite}
          >
            {invitingSaving ? "…" : "Invite"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onCloseInvite}>
            Cancel
          </button>
        </div>
      )}
      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span>Name</span>
          <span>Role</span>
          <span>Last active</span>
          <span />
        </div>
        {members.map((m) => (
          <div className={styles.tableRow} key={m.userId}>
            <div className={styles.memberName}>
              <span
                className={styles.avatar}
                style={{ background: "var(--rw-accent)" }}
              >
                {initials(`${m.firstName} ${m.lastName}`)}
              </span>
              <div>
                <div className={styles.label}>
                  {m.firstName} {m.lastName}
                </div>
                <div className={styles.hint}>{m.email}</div>
              </div>
            </div>
            {isAdmin && m.userId !== currentUserId ? (
              <select
                className={styles.select}
                value={m.role}
                onChange={(e) =>
                  onChangeRole(m.userId, e.target.value as MembershipRole)
                }
              >
                {membershipRole.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <span>{m.role}</span>
            )}
            <span className={styles.hint}>
              {m.lastActiveAt.toLocaleDateString()}
            </span>
            {isAdmin && m.userId !== currentUserId ? (
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(m.userId)}
              >
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function BillingTab({
  usage,
  onUpgrade,
}: {
  usage: Usage;
  onUpgrade: () => void;
}) {
  const rows: [string, { used: number; limit: number }][] = [
    ["Rewinds", usage.rewinds],
    ["Recording links", usage.recordingLinks],
    ["Members", usage.members],
    ...(flags.AI_SUMMARY
      ? ([["AI summaries", usage.aiSummaries]] as [
          string,
          { used: number; limit: number },
        ][])
      : []),
  ];
  return (
    <>
      <div className={styles.subheading}>Your plan</div>
      <div className={styles.planCard}>
        <div className={styles.flex1}>
          <div className={styles.planName}>Free</div>
          <div className={styles.hint}>30 Rewinds and core features</div>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onUpgrade}>
          Upgrade ↗
        </button>
      </div>
      <div className={styles.subheading}>Usage this cycle</div>
      <div className={styles.usageCard}>
        {rows.map(([label, { used, limit }]) => (
          <div className={styles.usageRow} key={label}>
            <div className={styles.usageHead}>
              <span className={styles.flex1}>{label}</span>
              <span className={styles.hint}>{limit - used} left</span>
            </div>
            <div className={styles.usageValue}>
              {used} / {limit}
            </div>
            <div className={styles.usageBar}>
              <div
                className={styles.usageBarFill}
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function WebhooksTab({ onSetUp }: { onSetUp: () => void }) {
  return (
    <>
      <div>
        <div className={styles.label}>Webhooks</div>
        <div className={styles.hint}>
          Receive real-time events when Rewinds are created, updated or
          commented on
        </div>
      </div>
      <div className={styles.webhookCard}>
        <span className={styles.flex1}>Webhook endpoint</span>
        <button type="button" className={styles.secondaryButton} onClick={onSetUp}>
          Set up ↗
        </button>
      </div>
    </>
  );
}

function IntegrationsTab({
  connected,
  busy,
  onToggle,
}: {
  connected: string[];
  busy: string | null;
  onToggle: (id: string, connect: boolean) => void;
}) {
  return (
    <>
      <div>
        <div className={styles.label}>Connect apps</div>
        <div className={styles.hint}>
          Send Rewinds to the tools your team already uses
        </div>
      </div>
      <div className={styles.cardGrid}>
        {INTEGRATION_CATALOG.map((app) => {
          const isConnected = connected.includes(app.id);
          return (
            <div className={styles.card} key={app.id}>
              <div
                className={styles.cardIcon}
                style={{ background: app.color }}
                aria-hidden="true"
              >
                {app.initial}
              </div>
              <div className={styles.label}>{app.name}</div>
              <div className={styles.hint}>{app.description}</div>
              <button
                type="button"
                aria-label={`${isConnected ? "Disconnect" : "Connect"} ${app.name}`}
                className={isConnected ? styles.dangerButton : styles.primaryButton}
                disabled={busy === app.id}
                onClick={() => onToggle(app.id, !isConnected)}
              >
                {isConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SdkTab({
  onVerify,
  onCopy,
}: {
  onVerify: () => void;
  onCopy: () => void;
}) {
  const [url, setUrl] = useState("");
  return (
    <>
      <div>
        <div className={styles.label}>Connect your domain</div>
        <div className={styles.hint}>
          Add the Rewind snippet to start recording sessions on your site
        </div>
      </div>
      <div className={styles.subheading}>1 · Install snippet</div>
      <div className={styles.codeBlock}>
        <div className={styles.codeBlockHead}>
          <span className={styles.flex1}>index.html</span>
          <button type="button" className={styles.linkButton} onClick={onCopy}>
            Copy
          </button>
        </div>
        <pre className={styles.codeBlockBody}>
          {'<script src="https://cdn.rewind.dev/sdk.js" data-key="..."></script>'}
        </pre>
      </div>
      <div className={styles.subheading}>2 · Verify</div>
      <div className={styles.row}>
        <input
          className={styles.flex1}
          placeholder="https://your-domain.com"
          aria-label="Domain to verify"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="button" className={styles.secondaryButton} onClick={onVerify}>
          Verify
        </button>
      </div>
    </>
  );
}

type AccessToken = { id: string; name: string; createdAt: string };

function McpTab({ onNotice }: { onNotice: (message: string) => void }) {
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/tokens")
      .then((res) => (res.ok ? (res.json() as Promise<AccessToken[]>) : []))
      .then(setTokens)
      .catch(() => {});
  }, []);

  async function createToken() {
    const name = window.prompt("Name this token (e.g. your MCP client)");
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("failed");
      const row = (await res.json()) as AccessToken & { token: string };
      setTokens((t) => [...t, row]);
      onNotice(`Token created: ${row.token} (copy it now, it won't be shown again)`);
    } catch {
      onNotice("Couldn't create that token");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div>
        <div className={styles.label}>Personal access tokens</div>
        <div className={styles.hint}>
          Used by MCP clients to authenticate as you
        </div>
      </div>
      {tokens.map((t) => (
        <div className={styles.tableRow} key={t.id}>
          <span>{t.name}</span>
        </div>
      ))}
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={creating}
        onClick={createToken}
      >
        + Create token
      </button>
      <div className={styles.divider} />
      <div className={styles.subheading}>AI agents</div>
      <div className={styles.cardGrid}>
        {[
          { name: "Claude", initial: "C", color: "#d97757" },
          { name: "Cursor", initial: "C", color: "#000" },
        ].map((agent) => (
          <div className={styles.card} key={agent.name}>
            <div
              className={styles.cardIcon}
              style={{ background: agent.color }}
              aria-hidden="true"
            >
              {agent.initial}
            </div>
            <div className={styles.label}>{agent.name}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function CliTab({ onCopy }: { onCopy: () => void }) {
  const [os, setOs] = useState<"mac" | "linux" | "windows">("mac");
  const installCmd: Record<typeof os, string> = {
    mac: "brew install rewind-cli",
    linux: "curl -fsSL https://cli.rewind.dev/install.sh | sh",
    windows: "winget install Rewind.Cli",
  };
  return (
    <>
      <div>
        <div className={styles.label}>Rewind CLI</div>
        <div className={styles.hint}>
          Attach a Rewind to a bug report straight from your terminal
        </div>
      </div>
      <div className={styles.subheading}>1 · Install</div>
      <div className={styles.segmented}>
        {(["mac", "linux", "windows"] as const).map((o) => (
          <button
            key={o}
            type="button"
            className={o === os ? styles.segmentActive : styles.segment}
            onClick={() => setOs(o)}
          >
            {o === "mac" ? "macOS" : o === "linux" ? "Linux" : "Windows"}
          </button>
        ))}
      </div>
      <div className={styles.codeBlock}>
        <div className={styles.codeBlockHead}>
          <span className={styles.flex1}>Terminal</span>
          <button type="button" className={styles.linkButton} onClick={onCopy}>
            Copy
          </button>
        </div>
        <pre className={styles.codeBlockBody}>{installCmd[os]}</pre>
      </div>
    </>
  );
}

function AccountTab({
  user,
  avatarUrl,
  saving,
  deletingAccount,
  onAvatar,
  onRemoveAvatar,
  onFirstName,
  onLastName,
  onRole,
  onTheme,
  onDelete,
}: {
  user: User;
  avatarUrl: string | null;
  saving: string | null;
  deletingAccount: boolean;
  onAvatar: (f: File) => void;
  onRemoveAvatar: () => void;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onRole: (v: UserRole) => void;
  onTheme: (dark: boolean) => void;
  onDelete: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [syncedName, setSyncedName] = useState([user.firstName, user.lastName]);
  if (user.firstName !== syncedName[0] || user.lastName !== syncedName[1]) {
    setSyncedName([user.firstName, user.lastName]);
    setFirstName(user.firstName);
    setLastName(user.lastName);
  }
  return (
    <>
      <div className={styles.subheading}>Profile</div>
      <div className={styles.row}>
        <div className={styles.avatarLarge}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned MinIO URL
            <img src={avatarUrl} alt="" className={styles.logoImg} />
          ) : (
            <span
              className={styles.avatarFallback}
              style={{ background: "#3538cd" }}
            >
              {initials(`${user.firstName} ${user.lastName}`)}
            </span>
          )}
        </div>
        <div>
          <div className={styles.avatarActions}>
            <label className={styles.secondaryButton}>
              {avatarUrl ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onAvatar(f);
                }}
              />
            </label>
            {avatarUrl && (
              <button type="button" className={styles.linkButton} onClick={onRemoveAvatar}>
                Remove
              </button>
            )}
          </div>
          <div className={styles.hint}>JPG, PNG or GIF. Cropped to a square.</div>
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor="acct-first">First name</label>
          <input
            id="acct-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={() =>
              firstName.trim() && firstName !== user.firstName && onFirstName(firstName.trim())
            }
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="acct-last">Last name</label>
          <input
            id="acct-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={() =>
              lastName.trim() && lastName !== user.lastName && onLastName(lastName.trim())
            }
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="acct-role">Role</label>
        <select id="acct-role" value={user.role} onChange={(e) => onRole(e.target.value as UserRole)}>
          {userRole.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="acct-email">Email</label>
        <input id="acct-email" value={user.email} disabled className={styles.disabledInput} />
      </div>
      <div className={styles.divider} />
      <div className={styles.settingRow}>
        <div className={styles.flex1}>
          <div className={styles.label}>Appearance</div>
          <div className={styles.hint}>Applies to the web app and the extension</div>
        </div>
        <div className={styles.segmented}>
          <button
            type="button"
            className={user.theme === "light" ? styles.segmentActive : styles.segment}
            onClick={() => onTheme(false)}
          >
            Light
          </button>
          <button
            type="button"
            className={user.theme === "dark" ? styles.segmentActive : styles.segment}
            onClick={() => onTheme(true)}
          >
            Dark
          </button>
        </div>
      </div>
      <div className={styles.divider} />
      <div className={styles.settingRow}>
        <span className={styles.flex1}>Delete account</span>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={deletingAccount}
          onClick={onDelete}
        >
          {deletingAccount ? "…" : "Delete"}
        </button>
      </div>
      {saving && <span className={styles.savingHint}>Saving…</span>}
    </>
  );
}

function NotificationsTab({
  user,
  onToggle,
  onTurnOffAll,
}: {
  user: User;
  onToggle: (field: (typeof NOTIF_LABELS)[number][0], value: boolean) => void;
  onTurnOffAll: () => void;
}) {
  return (
    <>
      <div className={styles.subheading}>Email notifications</div>
      <div className={styles.notifCard}>
        {NOTIF_LABELS.map(([field, label]) => (
          <div className={styles.notifRow} key={field}>
            <span className={styles.flex1}>{label}</span>
            <Toggle
              on={Boolean(user[field])}
              onChange={(v) => onToggle(field, v)}
              label={label}
            />
          </div>
        ))}
      </div>
      <div className={styles.settingRow}>
        <span className={styles.flex1}>Don&apos;t send me email notifications</span>
        <button type="button" className={styles.linkButton} onClick={onTurnOffAll}>
          Turn off all
        </button>
      </div>
    </>
  );
}
