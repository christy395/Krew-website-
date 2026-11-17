# Krew Dashboard

A clean, responsive control panel for managing Krew Bot in your Discord communities.

Krew Dashboard brings the most-used server settings into one place: welcome messages, goodbye messages, automatic roles, and server details. It uses Discord sign-in and checks each member's server permissions before showing or changing that server's settings.

## Features

- **Discord sign-in** with OAuth2 authorization code flow and PKCE.
- **Server picker** that only lists servers where the signed-in user has Manage Server permission and Krew is installed.
- **Welcome messages** with a configurable channel, message, member mention, image URL, embed title, footer, and color.
- **Goodbye messages** with a configurable channel, message, mention option, and embed appearance.
- **Automatic roles** with multiple role selection and an optional delay.
- **Live message previews** while editing.
- **Responsive layout** for desktop and mobile screens.
- **Protected server-side API** with HttpOnly sessions and a private bot-to-dashboard shared secret.

## Project structure

```text
.
├── migrations/
│   └── 0001_auth.sql
├── src/
│   ├── react-app/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── types.ts
│   └── worker/
│       └── index.ts
├── index.html
├── package.json
├── vite.config.ts
└── wrangler.jsonc
```

## Requirements

- Node.js 20.10 or newer
- npm
- A Discord application with OAuth2 enabled
- A Neon PostgreSQL database and its connection string
- The matching Krew Bot management API

## Local development

Install dependencies:

```bash
npm install
```

Create a local secrets file named `.dev.vars` in the project root. Do not commit this file.

```dotenv
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:5173/api/auth/callback
KREW_BOT_API_URL=http://localhost:3000
KREW_DASHBOARD_API_SECRET=use_the_same_long_random_secret_as_the_bot
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Create a Neon project and database, then set its pooled connection string as the server-side `DATABASE_URL` secret. Run the SQL in `migrations/0001_auth.sql` against that Neon database using the Neon SQL Editor or a PostgreSQL client.

Start the development server:

```bash
npm run dev
```

Run the checks:

```bash
npm run typecheck
npm run build
```

## Discord application settings

Add the exact callback URL to the Discord application's OAuth2 redirect URI list:

```text
http://localhost:5173/api/auth/callback
```

For the live environment, add the matching callback URL for your chosen domain and set the same value as `DISCORD_REDIRECT_URI`.

The dashboard stores OAuth state and login sessions in Neon PostgreSQL. Keep `DATABASE_URL` private and use the pooled connection string from Neon.\n\nThe dashboard requests these OAuth2 scopes:

- `identify`
- `guilds`

The application secret and bot integration secret must stay server-side. Never place them in a `VITE_*` variable, frontend source file, or committed configuration file.

## Krew Bot connection

The dashboard communicates with the bot through a private management API. The API base URL is set with `KREW_BOT_API_URL`. Set `KREW_DASHBOARD_API_SECRET` on both the dashboard runtime and the bot runtime to the same long, random value.

The matching bot-side implementation is in the `dashboard-api` branch of [christy395/krew-bot-](https://github.com/christy395/krew-bot-/tree/dashboard-api). That branch adds these authenticated routes:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/dashboard/guilds` | List servers the bot is in |
| GET | `/dashboard/guilds/:guildId` | Read server, channel, role, and welcome settings |
| PATCH | `/dashboard/guilds/:guildId/welcome` | Update welcome settings |
| PATCH | `/dashboard/guilds/:guildId/goodbye` | Update goodbye settings |
| PATCH | `/dashboard/guilds/:guildId/autoroles` | Update automatic role settings |

The bot branch must be running before the dashboard can load live server settings or save changes. The dashboard does not silently use demo data when the bot API is unavailable.

## Message placeholders

Welcome and goodbye messages can use:

- `{user}` — the member mention / user
- `{user.tag}` — the member's Discord tag
- `{server}` — the server name

The bot formats these placeholders when the event occurs.

## Security notes

- OAuth2 uses the authorization-code flow with PKCE.
- Session identifiers are random, stored as hashes, and sent in Secure, HttpOnly, SameSite cookies.
- OAuth state and PKCE verifiers expire after ten minutes.
- Server settings are only available to users with Manage Server permission.
- The bot management API requires a private bearer secret.
- Role assignment is validated against the server's roles and the bot's highest role.
- Image links must use HTTPS.
- Secrets belong in the runtime's secret settings or local ignored secrets file, never in Git.

## Current status

The first dashboard version includes the sign-in flow, responsive interface, server navigation, settings editors, message previews, and the protected API bridge. The bot-side API is developed separately in the branch linked above; keep the bot and dashboard on matching configurations when connecting them.

## License

This project is available under the MIT License. See [LICENSE](LICENSE).
