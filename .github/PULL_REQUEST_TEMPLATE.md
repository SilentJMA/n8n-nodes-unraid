## What and why

<!-- What does this change, and which issue does it close? (Closes #…) -->

## Checklist

- [ ] `npm run build && npm run lint && npm run typecheck && npm test` passes
- [ ] No resource, operation, parameter, trigger event or credential name was renamed or removed (see the contract in AGENT.md)
- [ ] New GraphQL fields exist in `api/generated-schema.graphql` of unraid/api
- [ ] New log rules have a test with a real (redacted) log line
- [ ] Workflows regenerated with `npm run workflow` if node parameters or rules changed
- [ ] `CHANGELOG.md` has an entry under **Unreleased**
- [ ] No API keys, tokens, hostnames or personal data in code, tests or screenshots
