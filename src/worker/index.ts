import { Hono } from "hono";

type SessionRow = {
  session_id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  expires_at: number;
};

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_BOT_TOKEN: string;
  KREW_BOT_API_URL: string;
  KREW_DASHBOARD_API_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();
const COOKIE_NAME = "krew_session";
const SESSION_DAYS = 30;
const DISCORD_API = "https://discord.com/api/v10";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setSessionCookie(token: string, maxAge: number): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function loadSession(request: Request, env: Env): Promise<{ row: SessionRow; token: string } | null> {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;

  const sessionId = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT * FROM sessions WHERE session_id = ? AND expires_at > ?"
  ).bind(sessionId, Math.floor(Date.now() / 1000)).first<SessionRow>();

  if (!row) return null;
  return { row, token };
}

async function getAccessToken(session: { row: SessionRow }, env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (session.row.token_expires_at > now + 90) return session.row.access_token;

  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: session.row.refresh_token,
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) throw new Error("Discord session expired. Please sign in again.");
  const tokens = await response.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };

  const tokenExpiresAt = now + tokens.expires_in;
  await env.DB.prepare(
    "UPDATE sessions SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE session_id = ?"
  ).bind(tokens.access_token, tokens.refresh_token, tokenExpiresAt, session.row.session_id).run();

  session.row.access_token = tokens.access_token;
  session.row.refresh_token = tokens.refresh_token;
  session.row.token_expires_at = tokenExpiresAt;
  return tokens.access_token;
}

async function getManagedDiscordGuilds(session: { row: SessionRow }, env: Env) {
  const accessToken = await getAccessToken(session, env);
  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Could not load your Discord servers.");

  const guilds = await response.json() as Array<{
    id: string; name: string; icon: string | null; owner: boolean; permissions: string;
  }>;

  return guilds.filter((guild) => {
    const permissions = BigInt(guild.permissions || "0");
    return guild.owner || (permissions & 0x20n) === 0x20n || (permissions & 0x8n) === 0x8n;
  });
}

async function botApi<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.KREW_BOT_API_URL || !env.KREW_DASHBOARD_API_SECRET) {
    throw new Error("The Krew Bot management API has not been connected yet.");
  }
  const base = env.KREW_BOT_API_URL.replace(/\/+$/, "");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.KREW_DASHBOARD_API_SECRET}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${base}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String(data.error)
      : "The bot could not complete that request.";
    throw new Error(message);
  }
  return data;
}

async function assertSameOrigin(request: Request): Promise<boolean> {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateText(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length <= max;
}

app.get("/api/health", (c) => c.json({ ok: true, app: "Krew Dashboard" }));

app.get("/api/auth/discord", async (c) => {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(verifier)
  )));
  const expiresAt = Math.floor(Date.now() / 1000) + 600;

  await c.env.DB.prepare(
    "INSERT INTO oauth_states (state, code_verifier, expires_at) VALUES (?, ?, ?)"
  ).bind(state, verifier, expiresAt).run();

  const redirectUri = c.env.DISCORD_REDIRECT_URI || new URL("/api/auth/callback", c.req.url).toString();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify guilds",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  }).toString();

  return c.redirect(authorize.toString());
});

app.get("/api/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.redirect("/?auth=failed");

  const savedState = await c.env.DB.prepare(
    "SELECT code_verifier FROM oauth_states WHERE state = ? AND expires_at > ?"
  ).bind(state, Math.floor(Date.now() / 1000)).first<{ code_verifier: string }>();

  await c.env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (!savedState) return c.redirect("/?auth=invalid-state");

  const redirectUri = c.env.DISCORD_REDIRECT_URI || new URL("/api/auth/callback", c.req.url).toString();
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID,
      client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: savedState.code_verifier,
    }),
  });

  if (!tokenResponse.ok) return c.redirect("/?auth=failed");
  const tokens = await tokenResponse.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResponse.ok) return c.redirect("/?auth=failed");
  const user = await userResponse.json() as { id: string; username: string; avatar: string | null };

  const rawSession = randomToken(40);
  const sessionId = await sha256(rawSession);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO sessions
      (session_id, user_id, username, avatar, access_token, refresh_token, token_expires_at, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionId, user.id, user.username, user.avatar, tokens.access_token, tokens.refresh_token,
    now + tokens.expires_in, now, now + SESSION_DAYS * 86400
  ).run();

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": setSessionCookie(rawSession, SESSION_DAYS * 86400),
      "Cache-Control": "no-store",
    },
  });
});

app.get("/api/auth/me", async (c) => {
  const session = await loadSession(c.req.raw, c.env);
  if (!session) return c.json({ user: null });
  return c.json({
    user: {
      id: session.row.user_id,
      username: session.row.username,
      avatar: session.row.avatar,
    },
  });
});

app.post("/api/auth/logout", async (c) => {
  if (!(await assertSameOrigin(c.req.raw))) return jsonError("Invalid request origin.", 403);
  const session = await loadSession(c.req.raw, c.env);
  if (session) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE session_id = ?")
      .bind(session.row.session_id).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
});

app.get("/api/guilds", async (c) => {
  const session = await loadSession(c.req.raw, c.env);
  if (!session) return jsonError("Sign in with Discord to continue.", 401);

  try {
    const [userGuilds, botData] = await Promise.all([
      getManagedDiscordGuilds(session, c.env),
      botApi<{ guilds: Array<{ id: string; name: string; icon: string | null; memberCount: number }> }>(
        c.env, "/dashboard/guilds"
      ),
    ]);
    const botGuilds = new Map((botData.guilds || []).map((guild) => [guild.id, guild]));
    const guilds = userGuilds
      .filter((guild) => botGuilds.has(guild.id))
      .map((guild) => ({ ...botGuilds.get(guild.id)!, icon: botGuilds.get(guild.id)?.icon ?? guild.icon }));
    return c.json({ guilds });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load servers.", 502);
  }
});

async function checkGuildAccess(
  request: Request, env: Env, guildId: string
): Promise<{ session: { row: SessionRow; token: string }; allowed: boolean }> {
  const session = await loadSession(request, env);
  if (!session) return { session: null as never, allowed: false };
  const guilds = await getManagedDiscordGuilds(session, env);
  return { session, allowed: guilds.some((guild) => guild.id === guildId) };
}

app.get("/api/guilds/:guildId", async (c) => {
  const guildId = c.req.param("guildId");
  try {
    const access = await checkGuildAccess(c.req.raw, c.env, guildId);
    if (!access.session) return jsonError("Sign in with Discord to continue.", 401);
    if (!access.allowed) return jsonError("You need Manage Server permission for this server.", 403);
    const data = await botApi(c.env, `/dashboard/guilds/${encodeURIComponent(guildId)}`);
    return c.json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load server settings.", 502);
  }
});

async function updateGuildSettings(c: Parameters<Parameters<typeof app.patch>[1]>[0], section: string) {
  if (!(await assertSameOrigin(c.req.raw))) return jsonError("Invalid request origin.", 403);
  const guildId = c.req.param("guildId");
  const access = await checkGuildAccess(c.req.raw, c.env, guildId);
  if (!access.session) return jsonError("Sign in with Discord to continue.", 401);
  if (!access.allowed) return jsonError("You need Manage Server permission for this server.", 403);

  const body = await c.req.json().catch(() => null);
  if (!isObject(body)) return jsonError("Invalid settings payload.");

  if (section === "welcome") {
    if ("welcomeMessage" in body && !validateText(body.welcomeMessage, 2000)) return jsonError("Welcome message is too long.");
    if ("channelId" in body && body.channelId !== null && !validateText(body.channelId, 32)) return jsonError("Invalid channel.");
    if ("welcomeImage" in body && body.welcomeImage !== null) {
      if (!validateText(body.welcomeImage, 500)) return jsonError("Image URL is too long.");
      try { if (new URL(String(body.welcomeImage)).protocol !== "https:") return jsonError("Image URLs must use HTTPS."); }
      catch { return jsonError("Enter a valid image URL."); }
    }
  }

  if (section === "goodbye") {
    if ("leaveMessage" in body && !validateText(body.leaveMessage, 2000)) return jsonError("Goodbye message is too long.");
    if ("goodbyeChannelId" in body && body.goodbyeChannelId !== null && !validateText(body.goodbyeChannelId, 32)) return jsonError("Invalid channel.");
  }

  if (section === "autoroles") {
    if (!Array.isArray(body.roleIds) || body.roleIds.length > 10 || body.roleIds.some((id) => typeof id !== "string" || id.length > 32)) {
      return jsonError("Choose up to 10 valid roles.");
    }
    if ("autoRoleDelay" in body && (!Number.isInteger(body.autoRoleDelay) || Number(body.autoRoleDelay) < 0 || Number(body.autoRoleDelay) > 3600)) {
      return jsonError("The role delay must be between 0 and 3600 seconds.");
    }
  }

  try {
    const data = await botApi(c.env,
      `/dashboard/guilds/${encodeURIComponent(guildId)}/${section}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
    return Response.json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save settings.", 502);
  }
}

app.patch("/api/guilds/:guildId/welcome", (c) => updateGuildSettings(c, "welcome"));
app.patch("/api/guilds/:guildId/goodbye", (c) => updateGuildSettings(c, "goodbye"));
app.patch("/api/guilds/:guildId/autoroles", (c) => updateGuildSettings(c, "autoroles"));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  console.error("Krew Dashboard API error:", error);
  return c.json({ error: "An unexpected server error occurred." }, 500);
});

export default app;