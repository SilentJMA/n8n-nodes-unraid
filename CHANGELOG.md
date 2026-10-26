# Changelog

All notable changes to this package. Versions follow [semver](https://semver.org/).

## Unreleased

## 0.1.2 - 2026-10-26

Fixes n8n Creator Portal vetting ("Can't find credential file in repo").

### Changed
- Sources moved to n8n's standard layout: `credentials/`, `nodes/` and `lib/` at the repo root, no longer under `src/`. n8n's tools map `package.json`'s `dist/credentials/X.js` to `credentials/X.ts` in the repo. The published files and their `dist/` paths are unchanged.
- The credential's *Ignore SSL Issues* field is now named `ignoreSslIssues`. n8n's lint rules treat any field name containing "cert" as a secret. Credentials saved with the old `allowUnauthorizedCerts` field keep working: it is still declared (hidden) and still read.
- `npm run lint` no longer needs exemptions for n8n's `no-credential-reuse` and `credential-password-field` rules.

## 0.1.1 - 2026-10-26

Passes n8n's community package scanner (`npx @n8n/scan-community-package @silentjma/n8n-nodes-unraid`).

### Fixed
- `package.json`: `author` now includes the npm owner's email. The scanner requires an author email (`valid-author`), and n8n's Creator Portal reads it from npm to match the package to its owner ("Error getting author email from npm").
- Nodes declare their inputs and outputs with `NodeConnectionTypes.Main`.
- Errors from an operation are always raised as `NodeApiError` or `NodeOperationError`, with the item index, so n8n shows them properly per item.
- An invalid log filter pattern now fails with a clear node error. It no longer throws a plain `Error` from the log helpers.

### Added
- Credential icon. Node icons use the light/dark form.
- `npm run lint` now includes n8n's community node rules (`@n8n/eslint-plugin-community-nodes`, the ruleset the scanner runs), so CI catches scan failures before a release. ESLint is pinned to 9.29.0 to match that plugin.

### Docs
- Telegram needs a public HTTPS webhook. Set `N8N_WEBHOOK_URL`; on n8n 2.x, `WEBHOOK_URL` alone leaves test webhooks on the editor URL.

### Project
- Community files: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, issue and pull request templates, Dependabot.
- CI on every push and pull request. A release workflow publishes to npm with provenance when a `v*` tag is pushed.
- Buy Me a Coffee funding link.

## 0.1.0 - 2026-10-25

First release.

### Nodes
- **Unraid** action node:
  - System: health report with suggested next steps, info, metrics.
  - Array: status, start, stop, parity check start, pause, resume and cancel, parity history.
  - Disks and shares.
  - Docker: list, get, logs (analysed), update status, check for updates, start, stop, restart, pause, unpause, update one or more containers, update all.
  - VMs: list, start, stop, force stop, pause, resume, reboot, reset.
  - Log files: list and read, with a regex filter and severity analysis.
  - Notifications: create (optionally only if unique), list, overview, warnings and alerts, archive.
  - Custom GraphQL.
- **Unraid Trigger** polling events: log file lines, container log lines, health problems (optionally resolved ones too), new notifications, container state changes, container updates available.
- **Unraid API** credential: server URL, `x-api-key`, and an option to accept self-signed certificates. The credential test fails on a revoked or invalid key, even though Unraid answers those with HTTP 200.
- Containers can be given by name, ID or command-safe name (`plex_media_server`).
- Built-in rules for log lines and health findings, each with next steps:
  - Logs: disk I/O, filesystem corruption, OOM, hardware/MCE, kernel traces, disk space, parity, auth failures, segfaults, Docker, network, temperature, application fatal errors.
  - Health: array state, disk status, errors, temperature (separate HDD and SSD thresholds) and usage, SMART, parity, stopped autostart containers, updates, memory, CPU, Unraid alerts.

### Workflows
- `unraid-alerts.json`, `unraid-docker.json` and `unraid-sysadmin-bot.json`: alerts, Docker updates and on-demand actions, and sysadmin commands, all managed from a Telegram bot.
