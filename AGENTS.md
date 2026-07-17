# Real or Fake: BTV Headlines — agent instructions

Shared brain for any AI agent working in this repo (Codex, Claude Code, etc.).
Read `README.md` first for how the game works — this file only adds the rules an
agent needs so it doesn't break something.

## What this is
Plain static site, **no build step**: `index.html` + `style.css` + ES modules in
`js/`. Deployed by GitHub Pages via `.github/workflows/deploy.yml` on push. Four
headlines per round: three real (from the Btown Brief archive), one fake. Stephen is
non-technical — explain consequential changes in plain language.

## Rules that will trip you up
- **`data/*.json` is machine-maintained — do not hand-edit.**
  - `data/real-headlines.json` is crawled from the entire Btown Brief archive
    (`scripts/build-archive.mjs`, one-time build).
  - `data/fake-headlines.json` is hand-written + Claude-generated fakes; the twice-weekly
    Action `.github/workflows/refresh.yml` (`scripts/refresh.mjs`) pulls new real
    headlines from RSS and asks Claude for fresh fakes, **validated hard, committing
    nothing on failure.** Preserve that invariant if you touch the refresh path.
- **Cross-repo dependency:** this game's crawler is the source of truth for the
  `archive` repo's story-level `data/headlines.json`. Don't change the crawl output
  shape without checking `btownbrief/archive` still parses it.
- Monthly leaderboard on the **shared Btown Games Supabase backend** (`js/leaderboard.js`,
  slug `real-or-fake`). Public anon key calls security-definer RPCs only — no secrets in
  client JS.

## Runtime AI (leave on Claude)
`refresh.yml` calls the Anthropic API via the `ANTHROPIC_API_KEY` repo secret to generate
fakes. Runtime generation, independent of the coding assistant — don't switch providers
unless Stephen asks.

## Before you finish
No test suite. If you touched the refresh/crawl scripts, run them locally and confirm the
`data/*.json` files still parse and the site loads. Say what you verified.
