# @silentjma/n8n-nodes-unraid

[![npm](https://img.shields.io/npm/v/@silentjma/n8n-nodes-unraid?logo=npm)](https://www.npmjs.com/package/@silentjma/n8n-nodes-unraid)
[![CI](https://github.com/SilentJMA/n8n-nodes-unraid/actions/workflows/ci.yml/badge.svg)](https://github.com/SilentJMA/n8n-nodes-unraid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/kilwanitrod)

Unofficial n8n community nodes for the [Unraid API](https://docs.unraid.net/API/) (GraphQL, [unraid/api](https://github.com/unraid/api)).

- **Unraid**: an action node for System, Array, Disk, Share, Docker Container, Virtual Machine, Log File and Notification, plus a Custom GraphQL operation.
- **Unraid Trigger**: a polling trigger for new log lines (syslog or a container log), health problems, notifications, container state changes and container updates.

Both nodes use the same built-in rules ([lib/analysis.ts](lib/analysis.ts)). The rules tag log lines and health findings as `info`, `warning` or `critical` and attach **suggested next steps**.

## Installation

📦 **npm:** [@silentjma/n8n-nodes-unraid](https://www.npmjs.com/package/@silentjma/n8n-nodes-unraid)

**Community Nodes (recommended):** in n8n, open **Settings › Community Nodes › Install** and enter `@silentjma/n8n-nodes-unraid`.

**Manual / custom folder:** run `npm pack` and extract the tarball's `package/` folder into `~/.n8n/custom/n8n-nodes-unraid`. In Docker that is `/home/node/.n8n/custom`, which on Unraid is usually `/mnt/user/appdata/n8n/custom`. Then restart n8n.

Prefer workflows without a community node? [n8n-unraid-telegram-workflows](https://github.com/SilentJMA/n8n-unraid-telegram-workflows) has the same three workflows built only from n8n's built-in nodes.

## Requirements

- Unraid 7.2+ has the API built in. Older versions need the Unraid Connect plugin.
- An API key, created in **Settings › Management Access › API Keys** or with `unraid-api apikey --create`. Read operations work with a read-only role. Updates, restarts and array/VM control need **admin**.

## Credential: Unraid API

| Field | Notes |
| --- | --- |
| Server URL | WebGUI base URL, e.g. `https://192.168.1.10`. Requests go to `<url>/graphql` with header `x-api-key`. Use https when SSL is enabled: Unraid redirects http, and the request body is lost. |
| API Key | The key from the WebGUI |
| Ignore SSL Issues | For self-signed certificates |

## Unraid node operations

| Resource | Operations |
| --- | --- |
| System | Get Health Report (findings + next steps), Get Info, Get Metrics |
| Array | Get Status, Start, Stop, Start / Pause / Resume / Cancel Parity Check, Get Parity History |
| Disk / Share | Get Many |
| Docker Container | Get, Get Many (filters: state, updates only, autostart, name), Get Logs (analysed), Get Update Status, Check for Updates, Start, Stop, Restart, Pause, Unpause, Update (one or many), Update All |
| Virtual Machine | Get Many, Start, Stop, Force Stop, Pause, Resume, Reboot, Reset |
| Log File | Get Many (`/var/log`), Read (last N lines or from a line; regex filter; analysis; one item or one per line) |
| Notification | Create (optionally only if unique), Get Many, Get Overview, Get Warnings and Alerts, Archive, Archive All |
| Custom GraphQL | Execute any query or mutation |


<img width="638" height="763" alt="{0E837C8A-E0E8-4CB5-903F-C4CD4459B37A}" src="https://github.com/user-attachments/assets/a3143eab-9a77-4ef6-99b7-35f639eb996e" />

Containers can be given by **name** (`plex`) or ID.

## Unraid Trigger events

| Event | Fires on |
| --- | --- |
| Log File Line | New lines in a `/var/log` file at or above the minimum severity. Tracks the line count and handles log rotation. |
| Container Log Line | New lines in a container's log (cursor based) |
| Health Problem | A finding not reported before. Can also emit "resolved" items. |
| New Notification | New unread Unraid notification at or above an importance |
| Container State Changed | Start / stop / pause / removal |
| Container Update Available | A container newly has an image update |

On the first poll, the trigger only records a baseline. Turn on *Emit Existing on First Poll* to also get what already exists. Manual "Fetch Test Event" always returns current data.

## Workflows (managed from Telegram)

`npm run workflow` ([scripts/build-workflows.mjs](scripts/build-workflows.mjs)) generates three workflows in [workflows/](workflows/):

| Workflow | Triggers | What it does |
| --- | --- | --- |
| [Unraid · Alerts](workflows/unraid-alerts.json) | Syslog every minute, health report every 5 min | Sends each new problem to Telegram with suggested next steps and tappable follow-up commands (`/logs_sonarr`, `/disks`…). Repeats are throttled (60 min per alert key). Optional: AI triage (disabled by default), an Unraid notification as well, and automatic restart of stopped autostart containers. |
| [Unraid · Docker updates & actions](workflows/unraid-docker.json) | Weekly (Sun 04:00), and called by the bot | Weekly: updates every container that has a new image, except `cfg.excludeFromUpdates`. It reports only when something changed. Also answers the Docker commands. |
| [Unraid · Sysadmin & Telegram bot](workflows/unraid-sysadmin-bot.json) | Telegram Trigger | The bot. Answers the sysadmin commands and forwards Docker commands to the Docker workflow. |

<img width="1184" height="743" alt="image" src="https://github.com/user-attachments/assets/606adfce-023e-4d05-b873-b86bea7c8f0e" />


A Telegram bot delivers updates to a single webhook, so **only the bot workflow has a Telegram Trigger**. The other two just send messages.

### Commands

| Server | Docker |
| --- | --- |
| `/status`: health report with next steps | `/containers`: list with quick actions |
| `/info`: uptime, CPU, RAM, array usage | `/updates`: check for image updates |
| `/disks`: status, temperature, usage, errors | `/update_all`: update all (asks first) |
| `/parity`, `/parity_start` (asks first), `/parity_pause`, `/parity_resume`, `/parity_cancel` | `/update_<name>`, `/restart_<name>`, `/start_<name>` |
| `/syslog`: recent warnings with next steps | `/stop_<name>` (asks first) |
| `/notifications`, `/archive_all` | `/logs_<name>`: last lines, analysed |
| `/vms`, `/help` | |

Telegram commands allow only `a-z0-9_`, so container names are written with underscores: `Plex-Media-Server` becomes `/logs_plex_media_server`. Actions that ask first reply with a `…_confirm` command to tap.

For autocomplete, send this to @BotFather with `/setcommands`:

```text
status - Health report with next steps
info - Uptime, CPU, RAM, array usage
disks - Disk status and temperatures
containers - Docker containers with quick actions
updates - Check for container updates
syslog - Recent syslog warnings
parity - Parity check status
notifications - Unread Unraid notifications
help - All commands
```

### Setup

1. Create a bot with @BotFather and add a **Telegram** credential in n8n with its token.
   n8n must be reachable at a **public HTTPS** address (for example a Cloudflare Tunnel or a reverse proxy), and the n8n container needs `N8N_WEBHOOK_URL=https://<that host>/`, otherwise Telegram rejects the trigger with *Bad request*. See [SUPPORT.md](SUPPORT.md).
2. Import the three workflows. In each one, select the **Unraid API** credential (your server as `https://<unraid-ip>`, Ignore SSL Issues on) and the Telegram credential.
3. Publish the **Sysadmin & Telegram bot** workflow and send the bot any message. While `cfg.allowedChatIds` is empty, the bot only replies with your chat ID and runs nothing else.
4. Put that ID in **Bot settings › cfg.allowedChatIds**, **Alert settings › cfg.telegramChatId** and **Settings › cfg.telegramChatId** (Docker workflow). After that, the bot ignores every other chat.
5. In the bot's **Run Docker workflow** node, pick *Unraid · Docker updates & actions*. Alternatively, regenerate with `DOCKER_WORKFLOW_ID=<id> npm run workflow` and re-import.
6. Publish the Docker and Alerts workflows.

Keep **n8n** in `cfg.excludeFromUpdates`. Updating it recreates the container that is running the workflow, so the run is cut off and no report arrives.

The workflows use node types `CUSTOM.unraid` / `CUSTOM.unraidTrigger`, which n8n uses for nodes in `~/.n8n/custom`. If you install the package through Community Nodes, generate with `UNRAID_NODE_PREFIX=@silentjma/n8n-nodes-unraid npm run workflow`.

## Development

See [AGENT.md](AGENT.md) for the full maintenance and release procedure.

```bash
npm install
npm run build && npm run lint && npm run typecheck && npm test
npm pack   # -> silentjma-n8n-nodes-unraid-0.1.0.tgz
```

The queries in [lib/queries.ts](lib/queries.ts) are written against `api/generated-schema.graphql` from the unraid/api repository. Check them again when Unraid changes the schema.

## Support and contributing

- **Questions:** [Discussions › Q&A](https://github.com/SilentJMA/n8n-nodes-unraid/discussions/categories/q-a). Common problems are listed in [SUPPORT.md](SUPPORT.md).
- **Bugs and feature requests:** [open an issue](https://github.com/SilentJMA/n8n-nodes-unraid/issues/new/choose) using the templates. Never paste API keys or tokens.
- **Security:** report privately, see [SECURITY.md](SECURITY.md).
- **Contributing:** pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

If these nodes save you time, you can support the project:

<a href="https://www.buymeacoffee.com/kilwanitrod"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=kilwanitrod&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40"></a>

## License

[MIT](LICENSE). Not affiliated with or endorsed by Lime Technology / Unraid.
