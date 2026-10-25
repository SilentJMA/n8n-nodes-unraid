# Getting help

1. **Read the [README](README.md).** It covers installation, the credential, every operation and the Telegram workflows. The common pitfalls are listed below.
2. **Search** the existing [issues](https://github.com/SilentJMA/n8n-nodes-unraid/issues?q=is%3Aissue) and [discussions](https://github.com/SilentJMA/n8n-nodes-unraid/discussions).
3. **Ask in [Discussions › Q&A](https://github.com/SilentJMA/n8n-nodes-unraid/discussions/categories/q-a)** for setup questions and "how do I…". Include your package, n8n and Unraid versions.
4. **Open a [bug report](https://github.com/SilentJMA/n8n-nodes-unraid/issues/new?template=bug_report.yml)** when something is clearly broken.

Support is community-based and best effort. **Never share API keys or bot tokens.**

## Common problems

| Symptom | Fix |
|---|---|
| `API key validation failed` / credential test says *Invalid or revoked API key* | The key was revoked or regenerated. Create a new one in **Settings › Management Access › API Keys** and update the credential. |
| `Unraid API request failed` with an `http://` URL | Unraid redirects http to https when SSL is enabled, and the request body is lost. Use `https://…` and turn on **Ignore SSL Issues**. |
| `Forbidden` / *lacks the permission* | Updates, restarts, and array or VM control need the **admin** role on the API key. |
| The trigger never fires | The first poll only records a baseline. Use *Fetch Test Event*, or turn on **Emit Existing on First Poll**. |
| Telegram Trigger fails to activate with *Bad request - please check your parameters* (the n8n log says `An HTTPS URL must be provided for webhook`) | Telegram only accepts public **HTTPS** webhook URLs, and n8n builds them from its own settings. On the n8n container, set **`N8N_WEBHOOK_URL=https://<your public n8n host>/`** and restart. Setting only `WEBHOOK_URL` is not enough: n8n 2.x builds *test* webhook URLs from `N8N_EDITOR_BASE_URL`, so they stay `http://…`. Then publish the bot workflow, and don't use the trigger's test button while it is published. |
| Telegram bot does not answer | Only the bot workflow may have a Telegram Trigger, and it must be published. Check `cfg.allowedChatIds` holds your chat ID. |
| The weekly Docker update stops halfway | Keep `n8n` in `cfg.excludeFromUpdates`. Updating n8n kills its own execution. |

## Support the project

If this saves you time, [buy me a coffee](https://www.buymeacoffee.com/kilwanitrod) ☕.
