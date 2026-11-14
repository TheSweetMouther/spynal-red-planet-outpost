# Red Planet Outpost — Junior Astronaut Mission Trainer

NASA Space Apps Challenge 2026 prototype for players aged 7–12.

You command a solar-powered Mars outpost for 10 sols. Each sol you share a small
power budget between Life Support, Shielding, Comms and Science, and react to
solar storms taken from real NASA DONKI records. The lesson: **on Mars there is
never enough power for everything, so protecting the crew from a solar storm
means doing less science.**

No account, no ads, no tracking, no backend.

## Run, test, build

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # Vitest: resource math, fail conditions, event mapping, fallback chain, determinism
npm run balance    # 1,000 missions per strategy; exits 1 if a balance rule fails
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
```

Requires Node 20 or newer.

### Deploy to GitHub Pages

The build uses relative paths (`base: './'`), so `dist/` works from any sub-path.
Push the contents of `dist/` to a `gh-pages` branch, or build with a GitHub
Actions workflow that uploads `dist/` as the Pages artifact. No server code is needed.

### Refresh the NASA data

```bash
npm run fetch-donki      # downloads FLR + SEP from DONKI into public/data/donki/
npm run import-wayback   # backup: rebuilds replay snapshots from archived DONKI pages
```

`fetch-donki` tries the new CCMC endpoint, then `api.nasa.gov/DONKI`
(set `NASA_API_KEY` to use your own key; default `DEMO_KEY`). It also writes
`recent.json` so "Today's Sun" has a fresh fallback. After refreshing, run
`npm run balance` again: replay difficulty depends on the data.

## How it is built

```
src/sim/      pure, deterministic simulation (state + allocation + seed -> new state). No DOM.
              config.ts (all tunable constants), state.ts, step.ts, events.ts, rng.ts,
              strategies.ts (robot players), debrief.ts (key decisions, night notes, cards)
src/data/     facts.json (every real number + source), donki-mapping.ts, scenarios.ts,
              loader.ts (live -> old endpoint -> snapshot), image-credits.json
src/ui/       Preact screens: Title, Game, Debrief, Sources, Teacher
public/data/  donki/*.json snapshots (with fetched_at), images/ (with credits)
scripts/      fetch-donki.ts, import-wayback-donki.ts, balance.ts
tests/        sim.test.ts, data.test.ts
```

## Datasets

| Dataset | URL | What it drives | Live or archived |
|---|---|---|---|
| NASA CCMC DONKI: solar flares (FLR), solar energetic particles (SEP) | https://ccmc.gsfc.nasa.gov/tools/DONKI/ | Solar storms in Real Storm Replay and Today's Sun. Flare class C/M/X → small/medium/big storm; a linked, measured SEP → radiation spike | Replay: **archived** snapshots (`public/data/donki/sep2017.json`, `may2024.json`). Today's Sun: **live**, falling back to `api.nasa.gov/DONKI`, then the newest snapshot |
| Curiosity RAD surface radiation (Hassler et al. 2014) | https://doi.org/10.1126/science.1244797 | Baseline daily dose (0.64 mSv/day) | Archived fact |
| Curiosity RAD cruise radiation (Zeitlin et al. 2013) | https://doi.org/10.1126/science.1235989 | "Mars vs. the Space Station" card (1.84 mSv/day in cruise) | Archived fact |
| NASA OSDR RadLab (ISS DosTel dosimeters) | https://visualization.osdr.nasa.gov/radlab/gui/overview/ | "Mars vs. the Space Station" card (0.26–0.29 mGy/day, computed from 1–7 Apr 2022 readings) | Archived fact |
| NASA OSDR studies OSD-342, OSD-195, OSD-343, OSD-73 | https://osdr.nasa.gov/bio/repo/ | Real NASA Science cards: bones, muscles, body clock, radiation | Archived, curated |
| CSA food production toolkit | https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/ | Greenhouse card | Archived, curated |
| NASA-STD-3001 radiation limit (OCHMO technical brief) | https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf | The 600 mSv mission dose limit | Archived fact |
| NASA GISS Mars24 notes | https://www.giss.nasa.gov/tools/mars24/help/notes.html | Length of a sol | Archived fact |
| NASA space communications article | https://www.nasa.gov/missions/tech-demonstration/space-communications-7-things-you-need-to-know | 4–24 minute one-way comm delay | Archived fact |
| NASA / JPL Opportunity and 2018 dust storm news | https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/ | Dust storm event and its "true story" note | Archived fact |
| NASA Mars solar storm articles (Sep 2017, May 2024) | https://www.nasa.gov/missions/maven/nasa-watches-mars-light-up-during-epic-solar-storm/ | Why these replay windows were chosen; honesty note | Archived fact |
| NASA Image and Video Library (PIA23378, PIA22521) | https://images.nasa.gov/ | Two bundled pictures with credit lines | Archived, bundled |

The Mars Rover Photos API is not used.

Every number shown to players comes from `src/data/facts.json`, which stores
`value`, `unit`, `source_title`, `source_url` and `verified`. Game-scaled values
are in `src/sim/config.ts`, and the in-game "Science Behind This" page lists the
real value, the game value, and why they differ.

### Unverified values

None. Every entry in `facts.json` has `verified: true` (checked 2026-11-14; a test enforces this).

## DONKI status on 2026-11-14

- `https://ccmc.gsfc.nasa.gov/DONKI-API/get/…` and `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/…`:
  **connection refused / timed out** all day, from two networks. The reported move to
  the keyless CCMC endpoint could not be confirmed, and neither could its CORS headers.
- `https://api.nasa.gov/DONKI/…`: reachable. It returned **403 without a key and 429
  (rate limited) with `DEMO_KEY`**, not a 301. Its responses carry
  `Access-Control-Allow-Origin: *`, and the browser could read the 429.
- Because of this, the two replay snapshots were built by `scripts/import-wayback-donki.ts`
  from Internet Archive captures of DONKI's own event pages. They are real DONKI
  records (IDs such as `2017-09-10T15:35:00-FLR-001`), but **partial**: only events
  the archive captured are included (Sep 2017: 3 flares, 9 particle events;
  May 2024: 11 flares, 14 particle events). Each record links to its archived page.
  The snapshots say so (`partial: true`), and so does the Sources page.
- There is no `recent.json` yet, so "Today's Sun" currently falls back to the May 2024
  snapshot and shows `ARCHIVED DATA · from May 2024`.

Run `npm run fetch-donki` when DONKI is back to replace these with full API snapshots.

## Balance (1,000 seeded missions per strategy)

Random missions (the pass criteria are checked on these):

| Strategy | Win | Fail: life support | Fail: dose | Fail: science |
|---|---|---|---|---|
| All-in Science | 17.9% | 0.0% | 82.1% | 0.0% |
| All-in Safety | 0.0% | 0.0% | 0.0% | 100.0% |
| Balanced (fixed) | 23.3% | 0.0% | 8.4% | 68.3% |
| Comms-first (fixed) | 19.3% | 15.4% | 18.6% | 46.7% |
| Random | 0.0% | 99.9% | 0.1% | 0.0% |
| Adaptive (reacts to warnings) | 90.1% | 0.0% | 1.7% | 8.2% |

Adaptive win rate on the replay missions: September 2017 83.2%, May 2024 54.7% (the hard one).

## Known limitations

- Replay snapshots are partial (see above), so some real flares in those windows are missing.
- Storm doses are scaled far above real Mars-surface values so that choices matter in 10 turns. The Sources page says this plainly.
- "Today's Sun" has not been seen working live, because DONKI was down during development. The fallback chain is covered by tests with a fake fetch and was seen falling back correctly in a real browser.
- When a live request fails, the browser itself logs a network error in the console. The game handles it and shows the ARCHIVED badge.
- Replay missions need the site to be served over http(s) (any static host, or `npm run preview`). Opening `index.html` straight from disk will not load the data files.
- The reading level was reviewed by hand, not tested with children.
- Layout targets tablets (768px and wider) and desktops. Phones work but are cramped.
