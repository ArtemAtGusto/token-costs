# Token Costs Crawlers

Automated crawlers that track LLM token pricing for OpenAI, Anthropic, and Google.

> This repository is a fork of [mikkotikkanen/token-costs](https://github.com/mikkotikkanen/token-costs) and retains the original MIT license and copyright notice.

## How it works

Each provider crawler:

1. Reads the provider's public pricing page.
2. Normalizes prices to USD per million tokens.
3. Compares the result with the provider's current file in `prices/`.
4. Archives the prior snapshot in `prices/history/{provider}/` when prices change.
5. Opens a pull request containing only the provider's price changes.

Scheduled GitHub Actions runs start daily at 00:01 UTC.

## Development

Requires Node.js 26 or newer.

```bash
npm install
npm run build
npm test
```

Run one crawler locally:

```bash
npm run crawl:dev:openai
npm run crawl:dev:anthropic
npm run crawl:dev:google
```

Run every crawler:

```bash
npm run crawl:dev:all
```

Crawler runs can access live provider pages and update files under `prices/`.

## Manually trigger a crawler workflow

Only repository administrators can manually request workflows. Create a local `.env` from the example and add a GitHub API token:

```bash
cp env.example .env
# Set GITHUB_API_TOKEN in .env
MODEL=openai bin/run-crawler
```

Supported `MODEL` values are `openai`, `anthropic`, and `google`.

## Repository layout

```text
src/crawlers/       Provider crawlers and shared crawler code
src/utils/          HTTP and snapshot storage helpers
prices/             Current provider snapshots
prices/history/     Archived provider snapshots
bin/run-crawler     Manual workflow trigger
.github/workflows/  Tests and scheduled crawler jobs
```

See [AGENTS.md](AGENTS.md) for contribution and architecture details.

## License

MIT
