# Contributing

Thanks for helping improve the Unraid nodes for n8n! Bug reports, log rules, new operations and docs fixes are all welcome.

## Ways to help

| You want to… | Do this |
|---|---|
| Ask a question or get help | Start a [Discussion (Q&A)](https://github.com/SilentJMA/n8n-nodes-unraid/discussions/categories/q-a). See [SUPPORT.md](SUPPORT.md). |
| Report a bug | Open a [bug report](https://github.com/SilentJMA/n8n-nodes-unraid/issues/new?template=bug_report.yml) with versions and the redacted error |
| Suggest a feature or log rule | Open a [feature request](https://github.com/SilentJMA/n8n-nodes-unraid/issues/new?template=feature_request.yml) |
| Report a security problem | Report it **privately** as described in [SECURITY.md](SECURITY.md), never in a public issue |
| Fix or add something | Open a pull request. Read the rules below first. |

**Never post API keys, Telegram tokens, passwords or full diagnostics** in issues, discussions or pull requests. Redact log lines (IPs, hostnames, serials) where they matter to you.

## Development setup

Requirements: Node.js 20.19+, npm, and optionally an Unraid 7.2+ server for live testing.

```bash
git clone https://github.com/SilentJMA/n8n-nodes-unraid.git
cd n8n-nodes-unraid
npm install
npm run build && npm run lint && npm run typecheck && npm test
```

To try your build in n8n:
1. Run `npm pack` and extract the tarball's `package/` folder into `~/.n8n/custom/n8n-nodes-unraid`.
2. Restart n8n.

## Rules for pull requests

[AGENT.md](AGENT.md) is the full maintenance guide. The key rules:

1. **Don't break saved workflows.** Resource, operation, parameter, trigger event and credential names are stored in users' workflows. Never rename or remove them. Add new ones instead. A change of meaning needs a new node version.
2. **Follow the official schema.** Every GraphQL field must exist in [`api/generated-schema.graphql`](https://github.com/unraid/api/blob/main/api/generated-schema.graphql). Unraid rejects the whole query if one field is unknown.
3. **Test the rules.** Every new or changed log rule needs a test with a real (redacted) log line in `tests/analysis.test.ts`. `generic-error` stays the last rule.
4. **Keep the libraries pure.** `src/lib/analysis.ts` and `src/lib/logs.ts` must not import `n8n-workflow`.
5. **Regenerate the workflows.** If you change node parameters or rules the workflows use, run `npm run workflow` and commit the JSON. Never edit `workflows/*.json` by hand.
6. **Pass the gates.** CI runs build, lint, typecheck, tests and `npm pack` on every pull request.
7. **Update the changelog.** Add a line under **Unreleased** in `CHANGELOG.md`.
8. **Keep changes small and focused,** one topic per pull request, with plain, descriptive commit messages.

## Review and releases

Maintainers review pull requests, usually within a week, and squash-merge them. A release works like this:
1. A maintainer bumps `version` and moves the **Unreleased** changelog entries under the new version.
2. They push a `v<version>` tag.
3. The [release workflow](.github/workflows/release.yml) runs the gates, publishes to npm with provenance, and creates the GitHub release with the tarball and workflows.

Versioning follows [semver](https://semver.org/):
- **Patch:** fixes and rule tweaks.
- **Minor:** new operations, events and rules.
- **Major:** only when a saved workflow could behave differently.

## Code of conduct

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Support the project

If these nodes save you time, you can [buy me a coffee](https://www.buymeacoffee.com/kilwanitrod) ☕. It's never required.
