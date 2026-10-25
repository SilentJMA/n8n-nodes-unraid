# Security policy

These nodes control an Unraid server: Docker, the array and VMs. Please handle security problems carefully.

## Supported versions

Security fixes go into the latest minor release on npm (`@silentjma/n8n-nodes-unraid`). Update before reporting.

## Reporting a vulnerability

**Do not open a public issue.** Instead:
1. Go to [Report a vulnerability](https://github.com/SilentJMA/n8n-nodes-unraid/security/advisories/new) (GitHub private advisory).
2. Describe the problem, its impact and how to reproduce it. Use a test server and fake keys.

You'll get a reply within 7 days. Once a fix is released, the advisory will be published, and you'll be credited unless you'd rather not be.

## In scope

- The node, the trigger or the credential leaking an API key (logs, errors, node output).
- Telegram workflows that let a chat outside `cfg.allowedChatIds` run commands.
- Command or GraphQL injection through workflow inputs or Telegram messages.
- Destructive actions (update all, stop, parity check) that run without the documented confirmation.

## Out of scope

- Vulnerabilities in Unraid, the Unraid API, n8n or Telegram themselves. Report those upstream: Unraid ([unraid/api](https://github.com/unraid/api/security)), [n8n](https://github.com/n8n-io/n8n/security).
- A server exposed to the internet without protection, or an API key with more roles than needed.

## Hardening tips for users

- Give the API key only the roles it needs. Read-only is enough for alerts. Updates and restarts need admin.
- Keep the Unraid WebGUI and API off the internet. Use WireGuard, Tailscale or Unraid Connect.
- Always set `cfg.allowedChatIds` in the Telegram bot workflow.
- If a key was ever pasted somewhere public, revoke it in **Settings › Management Access › API Keys**.
