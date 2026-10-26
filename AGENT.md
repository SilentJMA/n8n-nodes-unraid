# AGENT.md: working on @silentjma/n8n-nodes-unraid

This repository holds two n8n nodes for the Unraid GraphQL API, **Unraid** (actions) and **Unraid Trigger** (polling), plus three generated Telegram workflows. The nodes are hand-written. The Unraid API is GraphQL, so there is no OpenAPI generator. This file says how to change, verify and release the package without breaking saved workflows.

## Layout

| Path | Role |
|---|---|
| `credentials/UnraidApi.credentials.ts` | Credential: server URL, `x-api-key`, self-signed option, and a test that rejects `UNAUTHENTICATED` / `FORBIDDEN` bodies |
| `lib/client.ts` | The only HTTP call: `POST <serverUrl>/graphql`. Maps GraphQL errors to node errors with hints. |
| `lib/queries.ts` | Every GraphQL document (`Q` queries, `M` mutations) |
| `lib/analysis.ts` | Pure rules: `classifyLogLine`, `analyzeHealth`, severities and next steps. No n8n imports. |
| `lib/logs.ts` | Splits, filters and classifies log text |
| `lib/containers.ts` | Resolves a container name, ID or command-safe name to its ID |
| `nodes/Unraid/Unraid.node.ts` | Action node: resources, operations, `execute` |
| `nodes/UnraidTrigger/UnraidTrigger.node.ts` | Polling trigger. State lives in `getWorkflowStaticData('node')`. |
| `tests/` | Vitest unit tests for the pure libs |
| `scripts/build-workflows.mjs` | Generates `workflows/*.json`. Never edit the JSON by hand. |
| `scripts/assets.cjs`, `svg-check.cjs`, `clean.cjs` | Build helpers: copy icons and codex files, and check the SVGs are safe |

## Contract

Keep these true in every change.

- **n8n's standard layout.** `credentials/`, `nodes/` and `lib/` stay at the repo root. n8n's Creator Portal and package scanner map `package.json`'s `dist/<dir>/X.js` to `<dir>/X.ts` in the repo, and fail with "Can't find credential file in repo" for any other layout.
- **No secret-looking names on non-secret fields.** n8n's lint rules flag any credential field whose name contains `password`, `secret`, `token`, `cert`, `apikey` and so on, unless it sets `typeOptions.password`. The scanner ignores inline `eslint-disable` comments.
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

Releases are published by [.github/workflows/release.yml](.github/workflows/release.yml), never from a laptop.

1. Bump `version` in `package.json` using semver:
   - **patch:** fixes and rule tweaks
   - **minor:** new operations, events or rules
   - **major:** a saved workflow could behave differently
2. In `CHANGELOG.md`, rename **Unreleased** to `## <version> - <YYYY-MM-DD>` and start a new empty **Unreleased** section.
3. Run the gates locally, then commit: `Release <version>`. Use plain commit messages without trailers.
4. Tag and push: `git tag v<version> && git push origin main v<version>`.
5. The workflow then:
   - checks the tag matches `package.json`
   - runs the gates
   - publishes with `npm publish --provenance --access public`, using the `NPM_TOKEN` repository secret
   - creates the GitHub release with the tarball and `workflows/*.json`, with the notes taken from the changelog section
6. Check [npm](https://www.npmjs.com/package/@silentjma/n8n-nodes-unraid) shows the new version with the provenance badge.

To re-run a failed publish without a new tag, use **Actions › Release › Run workflow** on `main`. A version that is already on npm is skipped, and the release assets are refreshed.

## Community

- Issues use the templates in `.github/ISSUE_TEMPLATE/`. Questions go to Discussions (Q&A), security reports to private advisories ([SECURITY.md](SECURITY.md)).
- Triage labels: `bug`, `enhancement`, `triage`, `question`, `good first issue`, `help wanted`.
- Every pull request needs green CI and the checklist in `.github/PULL_REQUEST_TEMPLATE.md`. Squash-merge.
- Dependabot opens monthly update pull requests. Merge development-dependency updates when CI is green. Read the n8n-workflow changelog before bumping it.

## Deploying to a self-hosted n8n custom folder

Extract the tarball's `package/` folder into `<n8n data>/custom/n8n-nodes-unraid`, replacing the old files, then restart n8n. Nodes loaded this way have type `CUSTOM.unraid` / `CUSTOM.unraidTrigger`, which is the default prefix in `build-workflows.mjs`. For the npm-installed package, generate the workflows with `UNRAID_NODE_PREFIX=@silentjma/n8n-nodes-unraid npm run workflow`.

## Gotchas

- `http://` URLs on servers with SSL enabled get a 302 to https, and the POST body is lost. Use `https://` plus *Ignore SSL Issues*.
- Unraid returns HTTP 200 with `errors[0].extensions.code = UNAUTHENTICATED` for a bad key. `client.ts` and the credential test depend on that code.
- `logFile` only reads files directly in `/var/log` (the server takes the basename). `startLine` is 1-based. A `totalLines` lower than the stored position means the log was rotated.
- Telegram commands allow only `[a-z0-9_]`. `commandSafeName` must stay in sync with the `cmd()` helper inside the generated workflows.
- A Telegram bot has one webhook, so only the bot workflow may contain a Telegram Trigger.
- Keep `n8n` in the Docker workflow's update exclusions. Updating it kills the running execution.
