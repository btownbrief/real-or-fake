# REAL OR FAKE: BTV HEADLINES

A Btown Games production for the [Btown Brief](https://www.btownbrief.com), Burlington VT's local newsletter.

Four local headlines: three ran in the Btown Brief, one is a fake. Tap the fake. Every real headline links back to its archived edition, so losing a round still means finding a story.

**Play:** https://btownbrief.github.io/real-or-fake/

## How it works

- Plain static site (no build step): `index.html` + `style.css` + `js/` ES modules.
- `data/real-headlines.json` — story headlines crawled from the entire Btown Brief archive (`scripts/build-archive.mjs`, one-time build).
- `data/fake-headlines.json` — hand-written + Claude-generated fakes in the archive's tone.
- `.github/workflows/refresh.yml` — twice a week, pulls new real headlines from the RSS feed and asks Claude for 10 fresh fakes (validated hard before commit).
- Monthly leaderboard on the shared Btown Games Supabase backend (`js/leaderboard.js`, game slug `real-or-fake`).
- Deployed by GitHub Pages via `.github/workflows/deploy.yml`.
