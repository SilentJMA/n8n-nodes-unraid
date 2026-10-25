# AGENT.md: working on @silentjma/n8n-nodes-unraid

This repository holds two n8n nodes for the Unraid GraphQL API, **Unraid** (actions) and **Unraid Trigger** (polling), plus three generated Telegram workflows. The nodes are hand-written. The Unraid API is GraphQL, so there is no OpenAPI generator. This file says how to change, verify and release the package without breaking saved workflows.

## Layout

| Path | Role |
|---|---|
| `src/credentials/UnraidApi.credentials.ts` | Credential: server URL, `x-api-key`, self-signed option, and a test that rejects `UNAUTHENTICATED` / `FORBIDDEN` bodies |
| `src/lib/client.ts` | The only HTTP call: `POST <serverUrl>/graphql`. Maps GraphQL errors to node errors with hints. |
| `src/lib/queries.ts` | Every GraphQL document (`Q` queries, `M` mutations) |
| `src/lib/analysis.ts` | Pure rules: `classifyLogLine`, `analyzeHealth`, severities and next steps. No n8n imports. |
| `src/lib/logs.ts` | Splits, filters and classifies log text |
| `src/lib/containers.ts` | Resolves a container name, ID or command-safe name to its ID |
| `src/nodes/Unraid/Unraid.node.ts` | Action node: resources, operations, `execute` |
| `src/nodes/UnraidTrigger/UnraidTrigger.node.ts` | Polling trigger. State lives in `getWorkflowStaticData('node')`. |
| `tests/` | Vitest unit tests for the pure libs |
| `scripts/build-workflows.mjs` | Generates `workflows/*.json`. Never edit the JSON by hand. |
| `scripts/assets.cjs`, `svg-check.cjs`, `clean.cjs` | Build helpers: copy icons and codex files, and check the SVGs are safe |

## Contract

Keep these true in every change.

- **Stable identities.** Resource values, operation values, parameter names, trigger event values, and the credential name `unraidApi` are what saved workflows store. Never rename or remove one. Add new ones instead. If an option must go, keep it working and hide it with `displayOptions`.
- **Behaviour changes need a node version.** If an existing parameter must start to mean something else, add `version: [1, 2]` and branch on `this.getNode().typeVersion`. Version 1 workflows must keep running unchanged.
- **Schema first.** Every field in `queries.ts` must exist in `api/generated-schema.graphql` of [unraid/api](https://github.com/unraid/api). Download it and check before adding fields. Unraid answers an unknown field with a GraphQL error for the whole query.
- **Analysis stays pure.** `analysis.ts` and `logs.ts` must not import `n8n-workflow`, so the rules stay unit-testable and the same everywhere.
- **Finding keys are stable.** The trigger and the alerts workflow deduplicate by `Finding.key`. Changing a key's format re-alerts every existing problem once, so call it out in the changelog.
- **No secrets in the repo.** Tests and examples use fake keys and hosts.

## Making a change

1. **Schema check.** When touching queries, fetch the current schema:
   `gh api repos/unraid/api/contents/api/generated-schema.graphql -H "Accept: application/vnd.github.raw" > /tmp/schema.graphql`
   Grep for every type and field you use.
2. **Rules.** A new log rule goes into `LOG_RULES` *before* the more generic rules it would otherwise lose to. `generic-error` must stay last. Add a `classifyLogLine` test case with a real log line.
3. **Gates.** All of these must pass:
   ```bash
   npm run build && npm run lint && npm run typecheck && npm test
   ```
   The n8n lint rules are strict: sentence-case `action` strings, a `description` that starts with "Whether" for boolean fields, and the standard description for dynamic options. Run `npx eslint . --fix`, then fix the rest by hand.
4. **Workflows.** After changing node parameters or rules that the workflows use, run `npm run workflow` and commit the regenerated JSON. Each workflow has to stay importable. Also check the connections, the node names referenced by `$('…')`, and that every Code node parses.
5. **Live check (optional, needs a server).** Run read-only operations against a real Unraid with a throwaway API key that you revoke afterwards. Never commit the key or put it in a file inside the repo.

## Releasing

1. Bump `version` in `package.json` with semver: a new operation or rule is a minor bump, a fix is a patch.
2. Add a dated section to `CHANGELOG.md`.
3. Run the gates, then `npm pack`. Check the tarball contains only `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` and `package.json`: `tar -tzf silentjma-n8n-nodes-unraid-<v>.tgz`.
4. Commit: `Release <v>`. Use plain commit messages without trailers.
5. Tag and create the GitHub release with the tarball and the three workflows attached:
   ```bash
   git tag v<v> && git push origin main --tags
   gh release create v<v> silentjma-n8n-nodes-unraid-<v>.tgz workflows/*.json --title "v<v>" --notes-file <notes>
   ```
6. Publish to npm (needs `npm login` as `silentjma`): `npm publish`. `publishConfig.access` is `public`, and `prepublishOnly` runs the gates again.

## Deploying to a self-hosted n8n custom folder

Extract the tarball's `package/` folder into `<n8n data>/custom/n8n-nodes-unraid`, replacing the old files, then restart n8n. Nodes loaded this way have type `CUSTOM.unraid` / `CUSTOM.unraidTrigger`, which is the default prefix in `build-workflows.mjs`. For the npm-installed package, generate the workflows with `UNRAID_NODE_PREFIX=@silentjma/n8n-nodes-unraid npm run workflow`.

## Gotchas

- `http://` URLs on servers with SSL enabled get a 302 to https, and the POST body is lost. Use `https://` plus *Ignore SSL Issues*.
- Unraid returns HTTP 200 with `errors[0].extensions.code = UNAUTHENTICATED` for a bad key. `client.ts` and the credential test depend on that code.
- `logFile` only reads files directly in `/var/log` (the server takes the basename). `startLine` is 1-based. A `totalLines` lower than the stored position means the log was rotated.
- Telegram commands allow only `[a-z0-9_]`. `commandSafeName` must stay in sync with the `cmd()` helper inside the generated workflows.
- A Telegram bot has one webhook, so only the bot workflow may contain a Telegram Trigger.
- Keep `n8n` in the Docker workflow's update exclusions. Updating it kills the running execution.
