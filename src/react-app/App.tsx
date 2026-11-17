import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, Bell, Bot, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Command, ExternalLink, Hash, LayoutDashboard, LogOut,
  MessageCircle, MessageSquare, Plus, Radio, RefreshCw, Settings2, ShieldCheck,
  Sparkles, Users, WandSparkles, X,
} from "lucide-react";
import type { ApiError, Guild, GuildDetail, User, WelcomeConfig } from "./types";

type Page = "overview" | "welcome" | "goodbye" | "autoroles" | "settings";
type SaveSection = "welcome" | "goodbye" | "autoroles";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const data = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function avatarUrl(user: User) {
  return user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : null;
}

function guildIcon(guild: Guild) {
  return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null;
}

function prettyInitials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

const defaultConfig: WelcomeConfig = {
  enabled: false,
  channelId: null,
  welcomeMessage: "Welcome {user} to {server}!",
  welcomePing: true,
  welcomeImage: null,
  welcomeEmbed: { title: "🎉 Welcome!", footer: "Welcome to {server}!", color: "#7665ef" },
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  leaveMessage: "{user} has left the server. We hope to see you again!",
  goodbyePing: false,
  goodbyeEmbed: { title: "👋 Goodbye", footer: "Goodbye from {server}!", color: "#ef6b83" },
  roleIds: [],
  autoRoleDelay: 0,
};

function Avatar({ user }: { user: User }) {
  const src = avatarUrl(user);
  return src
    ? <img className="avatar" src={src} alt="" />
    : <div className="avatar avatar-fallback">{prettyInitials(user.username)}</div>;
}

function ServerIcon({ guild, small = false }: { guild: Guild; small?: boolean }) {
  const src = guildIcon(guild);
  return src
    ? <img className={small ? "server-icon small" : "server-icon"} src={src} alt="" />
    : <div className={small ? "server-icon small server-fallback" : "server-icon server-fallback"}>{prettyInitials(guild.name)}</div>;
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? "switch is-on" : "switch"}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button className="button primary save-button" onClick={onClick} disabled={saving}>
      {saving ? <RefreshCw size={16} className="spin" /> : saved ? <Check size={16} /> : null}
      {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
    </button>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildId, setGuildId] = useState("");
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const loadGuilds = useCallback(async () => {
    const result = await api<{ guilds: Guild[] }>("/api/guilds");
    setGuilds(result.guilds || []);
    setGuildId((current) => current || result.guilds?.[0]?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    api<{ user: User | null }>("/api/auth/me")
      .then(async (result) => {
        if (!active) return;
        setUser(result.user);
        if (result.user) await loadGuilds();
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadGuilds]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    setError("");
    try {
      const result = await api<GuildDetail>(`/api/guilds/${encodeURIComponent(id)}`);
      setDetail(result);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Could not load this server.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && guildId) void loadDetail(guildId);
  }, [user, guildId, loadDetail]);

  const config = detail?.welcomeConfig || defaultConfig;
  const selectedGuild = useMemo(() => guilds.find((guild) => guild.id === guildId) || detail?.guild || null, [guilds, guildId, detail]);

  async function save(section: SaveSection, payload: Record<string, unknown>) {
    if (!guildId) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api(`/api/guilds/${encodeURIComponent(guildId)}/${section}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadDetail(guildId);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); }
    finally {
      setUser(null);
      setGuilds([]);
      setGuildId("");
      setDetail(null);
    }
  }

  function updateConfig(patch: Partial<WelcomeConfig>) {
    if (!detail) return;
    setDetail({ ...detail, welcomeConfig: { ...detail.welcomeConfig, ...patch } });
    setSaved(false);
  }

  const navItems: Array<{ id: Page; label: string; icon: typeof LayoutDashboard; group: string }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
    { id: "welcome", label: "Welcome", icon: MessageSquare, group: "ENGAGEMENT" },
    { id: "goodbye", label: "Goodbye", icon: MessageCircle, group: "ENGAGEMENT" },
    { id: "autoroles", label: "Auto roles", icon: Users, group: "ENGAGEMENT" },
    { id: "settings", label: "Server settings", icon: Settings2, group: "MANAGE" },
  ];

  function changePage(next: Page) {
    setPage(next);
    setMobileNav(false);
    setSaved(false);
    setError("");
  }

  if (loading) {
    return <div className="splash"><div className="brand-mark large"><Bot size={26} /></div><div className="loader" /><p>Getting your workspace ready…</p></div>;
  }

  if (!user) {
    return (
      <main className="login-page">
        <div className="login-glow glow-one" /><div className="login-glow glow-two" />
        <div className="login-card">
          <div className="brand-lockup"><div className="brand-mark"><Bot size={22} /></div><span>krew<span className="brand-light">.</span></span></div>
          <div className="login-art">
            <div className="orbit orbit-a" /><div className="orbit orbit-b" />
            <div className="login-bot"><Bot size={60} strokeWidth={1.4} /></div>
            <div className="float-chip chip-a"><MessageSquare size={16} /> Welcome messages</div>
            <div className="float-chip chip-b"><Sparkles size={16} /> Smart automation</div>
          </div>
          <div className="eyebrow"><span className="eyebrow-dot" /> THE CONTROL ROOM</div>
          <h1>Your server.<br /><span>Your rules.</span></h1>
          <p className="login-description">A calmer way to manage your Discord community. Configure Krew, shape your welcome experience, and keep everything in one place.</p>
          {error && <div className="notice error">{error}</div>}
          <a className="button discord-button" href="/api/auth/discord">
            <DiscordGlyph /> Continue with Discord <ArrowRight size={17} />
          </a>
          <p className="login-footnote"><ShieldCheck size={14} /> Secure sign-in. Your Discord password is never shared.</p>
        </div>
        <div className="login-footer">KREW DASHBOARD <span>•</span> BUILT FOR COMMUNITIES</div>
      </main>
    );
  }

  if (guilds.length === 0) {
    return (
      <main className="empty-state-screen">
        <div className="brand-lockup"><div className="brand-mark"><Bot size={22} /></div><span>krew<span className="brand-light">.</span></span></div>
        <div className="empty-card">
          <div className="empty-icon"><Radio size={28} /></div>
          <h1>No manageable servers found</h1>
          <p>Krew can only show servers where you have Manage Server permission and the bot is already a member.</p>
          {error && <div className="notice error">{error}</div>}
          <div className="empty-actions">
            <button className="button secondary" onClick={() => loadGuilds().catch((err: Error) => setError(err.message))}><RefreshCw size={16} /> Refresh servers</button>
            <button className="button ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
        <div className="user-pill"><Avatar user={user} /><span>{user.username}</span></div>
      </main>
    );
  }

  const channels = detail?.channels?.filter((channel) => channel.type === 0 || channel.type === 5) || [];
  const roles = detail?.roles?.filter((role) => !role.managed && role.name !== "@everyone") || [];
  const currentMessage = page === "goodbye" ? config.leaveMessage : config.welcomeMessage;
  const previewMessage = (currentMessage || "").replaceAll("{user}", "@NewMember").replaceAll("{server}", selectedGuild?.name || "Your server").replaceAll("{user.tag}", "NewMember#0000");

  return (
    <div className="dashboard-shell">
      <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <div className="sidebar-brand">
          <div className="brand-mark"><Bot size={21} /></div>
          <span>krew<span className="brand-light">.</span></span>
          <span className="brand-badge">DASHBOARD</span>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={19} /></button>
        </div>

        <div className="server-switcher-wrap">
          <label className="mini-label">CURRENT SERVER</label>
          <div className="server-switcher">
            {selectedGuild && <ServerIcon guild={selectedGuild} small />}
            <select aria-label="Choose a server" value={guildId} onChange={(event) => setGuildId(event.target.value)}>
              {guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </div>

        {["WORKSPACE", "ENGAGEMENT", "MANAGE"].map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {navItems.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => changePage(item.id)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.id === "welcome" && config.enabled && <span className="nav-status" />}
                </button>
              );
            })}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="support-card">
            <div className="support-icon"><CircleHelp size={18} /></div>
            <div><strong>Need a hand?</strong><span>Visit the help center</span></div>
            <ExternalLink size={14} />
          </div>
          <div className="sidebar-user">
            <Avatar user={user} />
            <div className="sidebar-user-copy"><strong>{user.username}</strong><span>Discord account</span></div>
            <button className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Command size={19} /></button>
            <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="connection-pill"><span /> Krew connected</div>
            <button className="topbar-help" title="Help"><CircleHelp size={18} /></button>
            <div className="topbar-user"><Avatar user={user} /><span>{user.username}</span></div>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="notice error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {detailLoading ? (
            <div className="content-loading"><div className="loader" /><span>Loading server settings…</span></div>
          ) : !detail ? (
            <div className="content-loading"><span>Select a server to continue.</span></div>
          ) : (
            <>
              {page === "overview" && (
                <section>
                  <div className="welcome-heading">
                    <div><div className="eyebrow">YOUR COMMUNITY, AT A GLANCE</div><h1>Good to see you.</h1><p>Here’s what’s happening in <strong>{detail.guild.name}</strong>.</p></div>
                    <ServerIcon guild={detail.guild} />
                  </div>
                  <div className="stats-grid">
                    <StatCard label="SERVER MEMBERS" value={detail.guild.memberCount.toLocaleString()} icon={<Users size={18} />} hint="Current member count" />
                    <StatCard label="WELCOME SYSTEM" value={config.enabled ? "Active" : "Off"} icon={<MessageSquare size={18} />} hint={config.channelId ? `#${channels.find((channel) => channel.id === config.channelId)?.name || "channel selected"}` : "No channel selected"} positive={config.enabled} />
                    <StatCard label="GOODBYE SYSTEM" value={config.goodbyeEnabled ? "Active" : "Off"} icon={<MessageCircle size={18} />} hint="Member departure messages" positive={config.goodbyeEnabled} />
                    <StatCard label="AUTO ROLES" value={String(config.roleIds?.length || 0)} icon={<ShieldCheck size={18} />} hint="Roles assigned on join" positive={!!config.roleIds?.length} />
                  </div>
                  <div className="section-heading"><div><h2>Quick setup</h2><p>Make Krew feel like part of your community.</p></div><span className="muted-tag">GET STARTED</span></div>
                  <div className="quick-grid">
                    <QuickCard number="01" icon={<MessageSquare size={19} />} title="Welcome new members" description="Choose a channel and write a message that greets every new arrival." action="Configure welcome" onClick={() => changePage("welcome")} />
                    <QuickCard number="02" icon={<MessageCircle size={19} />} title="Say goodbye your way" description="Set a farewell message for when a member leaves your server." action="Configure goodbye" onClick={() => changePage("goodbye")} />
                    <QuickCard number="03" icon={<Users size={19} />} title="Assign roles automatically" description="Give new members the roles they need as soon as they join." action="Set up auto roles" onClick={() => changePage("autoroles")} />
                  </div>
                  <div className="bottom-callout"><div className="callout-icon"><Sparkles size={20} /></div><div><strong>A little more personality goes a long way.</strong><p>Use placeholders like <code>{'{user}'}</code> and <code>{'{server}'}</code> to personalize each message automatically.</p></div><button className="text-link" onClick={() => changePage("welcome")}>Try it out <ArrowRight size={15} /></button></div>
                </section>
              )}

              {page === "welcome" && (
                <section>
                  <PageHeading eyebrow="MEMBER EXPERIENCE" title="Welcome messages" description="Make every new member feel at home from the moment they join." enabled={config.enabled} onToggle={(value) => updateConfig({ enabled: value })} />
                  <div className="editor-layout">
                    <div className="editor-column">
                      <Panel title="Welcome setup" description="Choose where Krew should greet new members.">
                        <FormRow label="Enable welcome messages" description="Send a message when someone joins."><Switch checked={config.enabled} onChange={(value) => updateConfig({ enabled: value })} /></FormRow>
                        <div className="field-block"><label>WELCOME CHANNEL</label><ChannelSelect value={config.channelId} channels={channels} onChange={(value) => updateConfig({ channelId: value || null })} /></div>
                        <div className="field-block"><label>MESSAGE</label><textarea className="textarea" rows={5} maxLength={2000} value={config.welcomeMessage || ""} onChange={(event) => updateConfig({ welcomeMessage: event.target.value })} placeholder="Welcome {user} to {server}!" /><div className="field-meta"><span>Use <code>{'{user}'}</code> and <code>{'{server}'}</code> to personalize.</span><span>{(config.welcomeMessage || "").length}/2000</span></div></div>
                        <FormRow label="Mention the new member" description="Ping the person in the welcome message."><Switch checked={config.welcomePing} onChange={(value) => updateConfig({ welcomePing: value })} /></FormRow>
                        <div className="field-block"><label>WELCOME IMAGE URL <span className="optional">OPTIONAL</span></label><input className="input" value={config.welcomeImage || ""} onChange={(event) => updateConfig({ welcomeImage: event.target.value || null })} placeholder="https://example.com/welcome.png" /></div>
                      </Panel>
                      <Panel title="Embed appearance" description="Give your welcome card a little personality.">
                        <div className="field-block"><label>EMBED TITLE</label><input className="input" value={config.welcomeEmbed?.title || ""} onChange={(event) => updateConfig({ welcomeEmbed: { ...config.welcomeEmbed, title: event.target.value } })} maxLength={256} /></div>
                        <div className="field-block"><label>FOOTER TEXT</label><input className="input" value={config.welcomeEmbed?.footer || ""} onChange={(event) => updateConfig({ welcomeEmbed: { ...config.welcomeEmbed, footer: event.target.value } })} maxLength={2048} /></div>
                        <div className="field-block color-field"><div><label>EMBED COLOR</label><span className="field-hint">Choose your accent color.</span></div><input type="color" value={normaliseColor(config.welcomeEmbed?.color)} onChange={(event) => updateConfig({ welcomeEmbed: { ...config.welcomeEmbed, color: event.target.value } })} /></div>
                      </Panel>
                      <div className="save-row"><span>{saved ? <><Check size={14} /> All changes saved</> : "Changes are not active until saved."}</span><SaveButton saving={saving} saved={saved} onClick={() => save("welcome", { enabled: config.enabled, channelId: config.channelId, welcomeMessage: config.welcomeMessage, welcomePing: config.welcomePing, welcomeImage: config.welcomeImage, welcomeEmbed: config.welcomeEmbed })} /></div>
                    </div>
                    <PreviewCard title="LIVE PREVIEW" guild={detail.guild} message={previewMessage} embedTitle={config.welcomeEmbed?.title || "🎉 Welcome!"} footer={config.welcomeEmbed?.footer || ""} color={normaliseColor(config.welcomeEmbed?.color)} image={config.welcomeImage} />
                  </div>
                </section>
              )}

              {page === "goodbye" && (
                <section>
                  <PageHeading eyebrow="MEMBER EXPERIENCE" title="Goodbye messages" description="Send a thoughtful farewell when someone leaves your community." enabled={config.goodbyeEnabled} onToggle={(value) => updateConfig({ goodbyeEnabled: value })} />
                  <div className="editor-layout">
                    <div className="editor-column">
                      <Panel title="Goodbye setup" description="Choose where departure messages should appear.">
                        <FormRow label="Enable goodbye messages" description="Send a message when someone leaves."><Switch checked={config.goodbyeEnabled} onChange={(value) => updateConfig({ goodbyeEnabled: value })} /></FormRow>
                        <div className="field-block"><label>GOODBYE CHANNEL</label><ChannelSelect value={config.goodbyeChannelId} channels={channels} onChange={(value) => updateConfig({ goodbyeChannelId: value || null })} /></div>
                        <div className="field-block"><label>MESSAGE</label><textarea className="textarea" rows={5} maxLength={2000} value={config.leaveMessage || ""} onChange={(event) => updateConfig({ leaveMessage: event.target.value })} placeholder="{user} has left the server." /><div className="field-meta"><span>Use <code>{'{user}'}</code> and <code>{'{server}'}</code> to personalize.</span><span>{(config.leaveMessage || "").length}/2000</span></div></div>
                        <FormRow label="Mention the member" description="Mention the person in the farewell message."><Switch checked={config.goodbyePing} onChange={(value) => updateConfig({ goodbyePing: value })} /></FormRow>
                      </Panel>
                      <Panel title="Embed appearance" description="Customize the farewell card.">
                        <div className="field-block"><label>EMBED TITLE</label><input className="input" value={config.goodbyeEmbed?.title || ""} onChange={(event) => updateConfig({ goodbyeEmbed: { ...config.goodbyeEmbed, title: event.target.value } })} maxLength={256} /></div>
                        <div className="field-block"><label>FOOTER TEXT</label><input className="input" value={config.goodbyeEmbed?.footer || ""} onChange={(event) => updateConfig({ goodbyeEmbed: { ...config.goodbyeEmbed, footer: event.target.value } })} maxLength={2048} /></div>
                        <div className="field-block color-field"><div><label>EMBED COLOR</label><span className="field-hint">Choose your accent color.</span></div><input type="color" value={normaliseColor(config.goodbyeEmbed?.color)} onChange={(event) => updateConfig({ goodbyeEmbed: { ...config.goodbyeEmbed, color: event.target.value } })} /></div>
                      </Panel>
                      <div className="save-row"><span>{saved ? <><Check size={14} /> All changes saved</> : "Changes are not active until saved."}</span><SaveButton saving={saving} saved={saved} onClick={() => save("goodbye", { goodbyeEnabled: config.goodbyeEnabled, goodbyeChannelId: config.goodbyeChannelId, leaveMessage: config.leaveMessage, goodbyePing: config.goodbyePing, leaveEmbed: config.goodbyeEmbed })} /></div>
                    </div>
                    <PreviewCard title="LIVE PREVIEW" guild={detail.guild} message={previewMessage} embedTitle={config.goodbyeEmbed?.title || "👋 Goodbye"} footer={config.goodbyeEmbed?.footer || ""} color={normaliseColor(config.goodbyeEmbed?.color)} goodbye />
                  </div>
                </section>
              )}

              {page === "autoroles" && (
                <section>
                  <PageHeading eyebrow="COMMUNITY AUTOMATION" title="Automatic roles" description="Assign roles automatically when a member joins your server." />
                  <div className="editor-layout">
                    <div className="editor-column">
                      <Panel title="Role assignment" description="Choose up to ten roles Krew should assign to new members.">
                        <div className="role-count-row"><div><strong>Roles to assign</strong><span>Select one or more roles below.</span></div><span className="count-pill">{config.roleIds?.length || 0} / 10</span></div>
                        <div className="role-list">
                          {roles.length === 0 ? <div className="inline-empty">No assignable roles were found for this server.</div> : roles.map((role) => {
                            const checked = (config.roleIds || []).includes(role.id);
                            return <label className={checked ? "role-option selected" : "role-option"} key={role.id}><span className="role-color" style={{ backgroundColor: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "#75788d" }} /><span className="role-name">{role.name}</span><span className={checked ? "checkbox checked" : "checkbox"}>{checked && <Check size={13} />}</span><input type="checkbox" checked={checked} disabled={!checked && (config.roleIds?.length || 0) >= 10} onChange={() => updateConfig({ roleIds: checked ? config.roleIds.filter((id) => id !== role.id) : [...(config.roleIds || []), role.id] })} /></label>;
                          })}
                        </div>
                        <div className="field-block delay-field"><label>ASSIGNMENT DELAY</label><div className="input-with-suffix"><input className="input" type="number" min="0" max="3600" value={config.autoRoleDelay || 0} onChange={(event) => updateConfig({ autoRoleDelay: Math.max(0, Math.min(3600, Number(event.target.value) || 0)) })} /><span>seconds</span></div><span className="field-hint">Set to 0 to assign roles immediately after a member joins.</span></div>
                      </Panel>
                      <div className="save-row"><span>{saved ? <><Check size={14} /> All changes saved</> : "Changes are not active until saved."}</span><SaveButton saving={saving} saved={saved} onClick={() => save("autoroles", { roleIds: config.roleIds || [], autoRoleDelay: config.autoRoleDelay || 0 })} /></div>
                    </div>
                    <div className="side-info-card"><div className="side-info-icon"><WandSparkles size={20} /></div><h3>Make joining effortless</h3><p>Auto roles can give new members a starter role, access to public channels, or a community tag without a moderator needing to do it manually.</p><div className="info-divider" /><div className="info-line"><Check size={15} /><span>Works as members join</span></div><div className="info-line"><Check size={15} /><span>Supports a short delay</span></div><div className="info-line"><Check size={15} /><span>Choose up to 10 roles</span></div></div>
                  </div>
                </section>
              )}

              {page === "settings" && (
                <section>
                  <PageHeading eyebrow="SERVER MANAGEMENT" title="Server settings" description="Review the server information available to Krew." />
                  <Panel title="Connected server" description="This is the Discord server currently selected in your workspace.">
                    <div className="server-detail-row"><ServerIcon guild={detail.guild} /><div><strong>{detail.guild.name}</strong><span>Server ID · {detail.guild.id}</span></div></div>
                    <div className="settings-facts"><div><span>Members</span><strong>{detail.guild.memberCount.toLocaleString()}</strong></div><div><span>Text channels</span><strong>{channels.length}</strong></div><div><span>Assignable roles</span><strong>{roles.length}</strong></div></div>
                    <div className="settings-note"><ShieldCheck size={17} /><span>Only members with Manage Server permission can access this dashboard for this server.</span></div>
                  </Panel>
                  <Panel title="Switch server" description="Choose another server where Krew is installed and you have permission.">
                    <div className="server-list">{guilds.map((guild) => <button key={guild.id} className={guild.id === guildId ? "server-list-item current" : "server-list-item"} onClick={() => { setGuildId(guild.id); changePage("overview"); }}><ServerIcon guild={guild} small /><span>{guild.name}</span>{guild.id === guildId ? <Check size={16} /> : <ArrowRight size={15} />}</button>)}</div>
                  </Panel>
                </section>
              )}
            </>
          )}
          <footer className="page-footer"><span>KREW DASHBOARD</span><span>MADE FOR YOUR COMMUNITY</span></footer>
        </div>
      </main>
    </div>
  );
}

function normaliseColor(color: string | undefined) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#7665ef";
}

function DiscordGlyph() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.73 5.2A18.7 18.7 0 0 0 15.1 3.75l-.57 1.16a17.3 17.3 0 0 0-5.05 0L8.9 3.75A18.6 18.6 0 0 0 4.26 5.2C1.32 9.55.52 13.8.92 18c1.93 1.43 3.8 2.3 5.64 2.88l1.25-2.04c-.69-.25-1.34-.56-1.96-.92l.48-.37c3.78 1.75 7.88 1.75 11.62 0l.48.37c-.62.36-1.28.67-1.96.92l1.25 2.04c1.84-.58 3.71-1.45 5.64-2.88.47-4.88-.8-9.1-3.63-12.8ZM8.57 14.9c-1.13 0-2.05-1.03-2.05-2.3s.9-2.3 2.05-2.3c1.16 0 2.08 1.04 2.06 2.3 0 1.27-.9 2.3-2.06 2.3Zm6.86 0c-1.13 0-2.05-1.03-2.05-2.3s.9-2.3 2.05-2.3c1.16 0 2.08 1.04 2.06 2.3 0 1.27-.9 2.3-2.06 2.3Z" /></svg>;
}

function StatCard({ label, value, icon, hint, positive = false }: { label: string; value: string; icon: React.ReactNode; hint: string; positive?: boolean }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon">{icon}</div></div><div className="stat-value">{value}</div><div className={positive ? "stat-hint positive" : "stat-hint"}><span className="stat-dot" />{hint}</div></div>;
}

function QuickCard({ number, icon, title, description, action, onClick }: { number: string; icon: React.ReactNode; title: string; description: string; action: string; onClick: () => void }) {
  return <button className="quick-card" onClick={onClick}><div className="quick-top"><span className="quick-icon">{icon}</span><span className="quick-number">{number}</span></div><h3>{title}</h3><p>{description}</p><span className="quick-action">{action}<ArrowRight size={15} /></span></button>;
}

function PageHeading({ eyebrow, title, description, enabled, onToggle }: { eyebrow: string; title: string; description: string; enabled?: boolean; onToggle?: (value: boolean) => void }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{onToggle && <div className="heading-toggle"><span className={enabled ? "status-label on" : "status-label"}>{enabled ? "Enabled" : "Disabled"}</span><Switch checked={!!enabled} onChange={onToggle} /></div>}</div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="panel"><div className="panel-heading"><div><h3>{title}</h3><p>{description}</p></div></div><div className="panel-body">{children}</div></div>;
}

function FormRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <div className="form-row"><div><strong>{label}</strong><span>{description}</span></div>{children}</div>;
}

function ChannelSelect({ value, channels, onChange }: { value: string | null; channels: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  return <div className="select-wrap"><Hash size={16} /><select className="input select-input" value={value || ""} onChange={(event) => onChange(event.target.value)}><option value="">Choose a channel</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select><ChevronDown size={15} /></div>;
}

function PreviewCard({ title, guild, message, embedTitle, footer, color, image, goodbye = false }: { title: string; guild: Guild; message: string; embedTitle: string; footer: string; color: string; image?: string | null; goodbye?: boolean }) {
  return <aside className="preview-panel"><div className="preview-heading"><span>{title}</span><span className="preview-live"><span /> LIVE</span></div><div className="discord-preview"><div className="discord-bar"><span className="discord-dot" /><span>{guild.name}</span><ChevronDown size={13} /></div><div className="discord-channel"><Hash size={15} /> general</div><div className="discord-message"><div className="fake-avatar">{goodbye ? "K" : "N"}</div><div className="fake-message-content"><div className="fake-name">{goodbye ? "Krew Bot" : "NewMember"} <span>Today at 4:20 PM</span></div><div className="embed-preview" style={{ borderLeftColor: color }}><strong>{embedTitle}</strong><p>{message || "Your message will appear here…"}</p>{image && !goodbye && <img className="embed-image" src={image} alt="Welcome preview" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<div className="embed-footer"><span className="bot-avatar"><Bot size={12} /></span>{footer.replaceAll("{server}", guild.name)}</div></div></div></div><div className="discord-input"><span>Message #general</span><Plus size={17} /></div></div><div className="preview-hint"><Sparkles size={15} /><span>This is an approximate preview. The live message may vary by server settings.</span></div></aside>;
}

export default App;