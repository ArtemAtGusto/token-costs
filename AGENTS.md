# Token Costs - Development Guide

## Project

This repository contains crawlers for OpenAI, Anthropic, and Google LLM pricing.
It is not an npm library or a hosted JSON API.

## Data flow

```text
Provider pricing pages
  -> src/crawlers/{provider}
  -> docs/api/v1/{provider}.json
  -> history/{provider}/{date}.json
  -> automated pull request
```

- `docs/api/v1/*.json` contains the current normalized provider snapshots.
- `history/{provider}/*.json` contains complete prior snapshots.
- Prices are always USD per million tokens.
- Model IDs must match provider API identifiers.
- Historical snapshots are append-only.

## Key commands

```bash
npm run build
npm test
npm run crawl:dev:openai
npm run crawl:dev:anthropic
npm run crawl:dev:google
npm run crawl:dev:all
```

Always build before running a crawler.

## Key files

- `src/crawlers/base.ts` - shared crawler execution
- `src/crawlers/{provider}/index.ts` - provider-specific parsing
- `src/crawlers/playwright.ts` - shared browser setup
- `src/utils/http.ts` - HTTP helpers
- `src/utils/storage.ts` - snapshot comparison, archival, and writes
- `src/types.ts` - crawler and snapshot types
- `src/test-local.ts` - live local crawler harness
- `.github/workflows/crawl-provider.yml` - reusable crawler workflow

Tests are co-located with source.

## Adding a provider

1. Add the provider to `Provider` in `src/types.ts`.
2. Create `src/crawlers/{provider}/index.ts` and its tests.
3. Add crawler and local-test scripts to `package.json`.
4. Add the provider to storage directory initialization and the local harness.
5. Add `.github/workflows/crawl-{provider}.yml`.
6. Add an initial `docs/api/v1/{provider}.json` snapshot and history directory.
7. Build, run focused tests, then run the crawler against the live provider page.

## Branching workflow

Branches are deleted after pull requests merge. Before making commits, verify the
current branch with `git branch`. Start each feature or fix from current
`origin/main`.

```bash
git fetch origin main
git checkout -b chore/my-change origin/main
```

Use one branch per change:

- `feat/short-description`
- `fix/short-description`
- `docs/short-description`
- `chore/short-description`

Do not reuse a merged branch or combine unrelated changes.

## Commits

Use conventional commits:

```text
type(scope): description
```

Pull request titles should also use conventional commit format.

## GitHub operations

Use the moi CLI instead of `gh`.

```bash
moi list
moi moi/token-costs-agent "<message>"
```
