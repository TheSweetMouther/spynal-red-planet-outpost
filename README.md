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

`fetch-donki` tries the new CCMC endpoint, then `api.nasa.gov/DONKI`. It reads
`NASA_API_KEY` (or `VITE_NASA_API_KEY`) from the environment, `.env.local` or
`.env`, prints only the first 4 characters, and falls back to `DEMO_KEY`. HTTP
429 and 503 are retried after 2 s, 5 s and 10 s before the next endpoint is
tried. If only the flare list fails, flares come from DONKI flare notifications
(class M5.0 and bigger) and the snapshot stays marked partial. It also writes `recent.json` so "Today's Sun" has a fresh fallback.
Each snapshot stores `source_endpoint` and `fetched_at`; the Science page shows
both. A successful API download replaces the partial archive-based snapshots and
clears their `partial` flag. After refreshing, run `npm run balance` again:
replay difficulty depends on the data, and the script exits 1 if any mission
breaks a balance rule.

### NASA API key (optional)

"Today's Sun" asks the keyless CCMC endpoint first, then `api.nasa.gov/DONKI`.
The second one needs a key. Without one the game uses `DEMO_KEY`, which is often
rate limited (HTTP 429). To use your own free key from https://api.nasa.gov/,
copy `.env.example` to `.env.local` and set:

```
VITE_NASA_API_KEY=your_key_here
```

then rebuild. **The key ships in the client bundle** and anyone can read it in
the browser. That is acceptable for api.nasa.gov keys: they are free, only
rate-limit open data, and can be replaced at any time. Do not put any other
secret in a `VITE_` variable. `npm run fetch-donki` reads `NASA_API_KEY` (or
`VITE_NASA_API_KEY`) from the environment.

### How "Today's Sun" loads

1. A loading panel ("Asking NASA about the Sun…") appears at once, with a Cancel
   button that goes straight to saved data.
2. FLR and SEP are requested in parallel. Each endpoint gets 4 seconds. The
   second endpoint is asked as soon as the first fails, or after 0.6 s if the
   first is slow, so the whole wait is at most about 4.6 s.
3. Order of preference: CCMC → api.nasa.gov → the last good live download (kept
   in `localStorage`, labelled `ARCHIVED DATA · fetched <date>`) → the newest
   bundled snapshot (`ARCHIVED DATA · from <dates>`). Saved data is never
   labelled LIVE.
4. When saved data is used, the first morning report says so in plain words.

## How it is built

```
src/sim/      pure, deterministic simulation (state + allocation + seed -> new state). No DOM.
              config.ts (all tunable constants), state.ts, step.ts, events.ts, rng.ts,
              strategies.ts (robot players), debrief.ts (key decisions, night notes, cards)
src/data/     facts.json (every real number + source), donki-mapping.ts, scenarios.ts,
              loader.ts (live -> old endpoint -> cached live -> snapshot), image-credits.json
src/ui/       Preact screens: Title, Game, Debrief, Sources, Teacher
public/data/  donki/*.json snapshots (with fetched_at), images/ (with credits)
scripts/      fetch-donki.ts, import-wayback-donki.ts, balance.ts
tests/        sim.test.ts, data.test.ts
```

## Datasets

| Dataset | URL | What it drives | Live or archived |
|---|---|---|---|
| NASA CCMC DONKI: solar flares (FLR), solar energetic particles (SEP) | https://ccmc.gsfc.nasa.gov/tools/DONKI/ | Solar storms in Real Storm Replay and Today's Sun. Flare class C/M/X → small/medium/big storm; a linked, measured SEP → radiation spike | Replay: **archived** snapshots (`public/data/donki/sep2017.json`, `may2024.json`). Today's Sun: **live**, falling back to `api.nasa.gov/DONKI`, then the last live download kept in the browser, then the newest snapshot |
| Curiosity RAD surface radiation (Hassler et al. 2014) | https://doi.org/10.1126/science.1244797 | Baseline daily dose (0.64 mSv/day) | Archived fact |
| Curiosity RAD cruise radiation (Zeitlin et al. 2013) | https://doi.org/10.1126/science.1235989 | "Mars vs. the Space Station" card (1.84 mSv/day in cruise) | Archived fact |
| NASA OSDR RadLab (ISS DosTel dosimeters) | https://visualization.osdr.nasa.gov/radlab/gui/overview/ | "Mars vs. the Space Station" card (the in-game card compares in words and in mSv only; the 0.26–0.29 mGy/day value, computed from 1–7 Apr 2022 readings, is on the Science page) | Archived fact |
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

## DONKI status on 2026-11-15

- `https://ccmc.gsfc.nasa.gov/DONKI-API/get/…`: no answer from the development
  machine (connection timeout); a browser play-test got **HTTP 503**.
- `https://api.nasa.gov/DONKI/…` with a real key (it forwards to the CCMC API):
  **SEP, CME and notifications return 200. FLR returns 404** from the backend
  (`"path":"/DONKI-API/get/FLR/"`) for every date range tried. With `DEMO_KEY`
  it returns 429.
- So the full flare list could not be downloaded. `npm run fetch-donki` and
  "Today's Sun" both fall back to **DONKI flare notifications**
  (`/notifications?type=FLR`), which DONKI issues for every flare of class M5.0
  and bigger and which carry the class, the peak time and the DONKI flare ID.
- Replay snapshots, rebuilt from the API on 2026-11-15:

  | Window | FLR before | FLR after | SEP before | SEP after |
  |---|---|---|---|---|
  | September 2017 (3–14 Sep) | 3 | 7 (4 from notifications, 3 kept from archived DONKI pages) | 9 | 9 (complete API download) |
  | May 2024 (9–20 May) | 11 | 20 (9 from notifications, 11 kept from archived DONKI pages) | 14 | 14 (complete API download) |

  Particle events are complete. Flares are complete for class M5.0 and bigger;
  **smaller flares may still be missing**, so the snapshots keep `partial: true`
  and the Science page says exactly this. Each snapshot stores `source_endpoint`,
  `fetched_at`, `flare_source` and `flr_problem`.
- "Today's Sun" was seen **LIVE** in a browser (`🟢 LIVE · fetched 15 Nov 2026
  10:25 UTC`, about 1.4 s). Its first morning report says that the flares come
  from NASA's flare alerts and only cover big flares. In the last 30 days DONKI
  has no M5+ flare and no particle event, so today's live mission has no storms.
- When DONKI's FLR endpoint works again, `npm run fetch-donki` replaces the
  snapshots with the full flare list and clears `partial`. Run `npm run balance`
  afterwards.

## Game rules changed in the fix pass

| Rule | Before | After | Why |
|---|---|---|---|
| Shielding | each cell blocked 20% of the whole day's dose, up to 4 cells | each cell blocks 40% of the **storm** dose for the crew inside, up to 2 cells; the everyday 33 mSv is never blocked | A fixed "always shield" plan no longer pays off on calm sols |
| Working outside in a storm | each Science cell added 10% of the storm dose | each Science cell adds 50% of the storm dose, at most 100% per sol; Shielding cannot reduce it | Teaches the real rule: on a storm day, cancel the EVA and shelter |
| Outside work on a calm sol | 4 mSv per Science cell | 5 mSv | Rushing science costs dose |
| Science goal | 20 samples; the counter could read "31 of 20" | 22 samples; the counter stops at the goal, extra samples are "bonus" and earn stars (goal / +5 / +10) | Goal is reached late; extra samples stay a trade-off |
| Random missions | 2–4 storms | 3–4 storms | Keeps the "rush, then hide" plan under 60% |
| Dust warning | shown, not labelled | labelled as a game rule; the preview says when saving cells helps | Battery is a choice, not luck |

## Balance (1,000 seeded missions per strategy, per mission)

`npm run balance` now checks **every mission** (Random and each replay; 1,000
seeds cover all 3 start-day offsets of a replay) against five rules: no fixed
strategy wins more than 60%; All-in Safety fails mostly on science; All-in
Science fails mostly on dose or life support; the adaptive player beats the best
fixed one by 15+ points; winning adaptive runs reach the goal on sol 8 or later
(median).

Win rates, before → after the fix pass:

| Strategy | Random | Sep 2017 replay | May 2024 replay |
|---|---|---|---|
| All-in Science | 17.9% → 0.0% | 0.0% → 0.0% | 0.0% → 0.0% |
| All-in Safety | 0.0% → 0.0% | 0.0% → 0.0% | 0.0% → 0.0% |
| Balanced (fixed) | 23.3% → 0.0% | 17.3% → 0.0% | 9.1% → 0.0% |
| Comms-first (fixed) | 19.3% → 0.0% | 0.0% → 0.0% | 9.1% → 0.0% |
| Rush science, then hide (no comms) | not measured → 50.9% | not measured → 0.0% | not measured → 0.0% |
| Fixed: shield 1, no comms, rest science | 62.1% → 14.9% | 0.0% → 0.0% | 5.0% → 0.0% |
| Fixed: shield 1, comms 1, rest science | 63.1% → 19.5% | 0.0% → 0.0% | 5.0% → 0.0% |
| Fixed: shield 2, no comms, rest science | **89.4%** → 35.2% | 0.0% → 0.0% | 35.2% → 0.0% |
| Fixed: shield 2, comms 1, rest science | 23.2% → 7.4% | 0.0% → 0.0% | 9.1% → 0.0% |
| Fixed: shield 3, no comms, rest science | 24.2% → 7.4% | **24.2%** → 0.0% | 24.2% → 0.0% |
| Fixed: shield 3 or 4, other variants | 0.0% → 0.0% | 0.0% → 0.0% | 0.0% → 0.0% |
| Random | 0.0% → 0.0% | 0.0% → 0.0% | 0.0% → 0.0% |
| Adaptive (reacts to warnings) | 90.1% → 81.1% | 83.2% → 85.4% | 54.7% → 54.0% |
| Adaptive, after the snapshots were rebuilt (15 Nov) | 81.1% | **40.5%** | **17.3%** |
| Best fixed strategy | 89.4% → 50.9% | 24.2% → 0.0% | 35.2% → 0.0% |
| Sol the adaptive player reaches the goal (median) | 9 → 10 | 10 → 10 | 9 → 10 |
| All five rules | FAIL → PASS | pass → PASS | pass → PASS |

"Before" was measured with the new, wider set of fixed strategies on the old
rules. The play-test's winning plan (Life Support 3, Shield 3, no Comms, rest
Science) is the 24.2% row on September 2017; it now loses every run.

After the snapshots were rebuilt with more real flares, every rule still passes on every
mission (no fixed strategy wins a single replay run; goal reached on sol 8, median), so
`config.ts` was not changed. But both replays are now much harder: the adaptive robot fails
Sep 2017 on dose 22.0% and science 37.5%, and May 2024 on dose 16.4% and science 66.3%.

How the adaptive player failed before the rebuild: Random 3.5% dose, 15.4% science;
Sep 2017 0% dose, 14.6% science; May 2024 7.3% dose, 38.7% science (the hard one).

## Known limitations

- **Replay flares are complete only for class M5.0 and bigger**, because DONKI's FLR endpoint returned 404 (see above). Particle events are complete.
- **The replay missions are now very hard.** With the real flare record, the robot that reacts to every warning wins September 2017 in 40.5% of runs and May 2024 in only 17.3%. The balance rules pass, so the rules were left alone, but May 2024 is probably too hard for most children.
- "Today's Sun" has no storms right now, because DONKI lists no M5+ flare or particle event in the last 30 days. Any plan wins such a mission.
- On the Random mission, "rush science with no Comms, then hide" still wins 50.9% of runs. It is under the 60% rule and 30 points behind the adaptive player, but it is the strongest non-reactive plan.
- A human who pushes Science hard on every calm sol and shelters on warnings can reach the goal around sol 6. The robot that paces itself reaches it on sol 9–10. After the goal, bonus stars and the dose limit keep a trade-off.
- Storm doses are scaled far above real Mars-surface values so that choices matter in 10 turns. The Sources page and every storm card say this plainly.
- The fallback chain, timeouts, cache and Cancel are covered by tests with a fake fetch.
- When a live request fails, the browser itself logs a network error in the console. The game handles it and shows the ARCHIVED badge and a notice.
- Replay missions need the site to be served over http(s) (any static host, or `npm run preview`). Opening `index.html` straight from disk will not load the data files.
- The tutorial now shows on the first mission only (flag in `localStorage`; "Replay tutorial" on the title screen). Two P2 items are not done: the layout shift on the first cell chip, and Science cards tied to specific events.
- The reading level was reviewed by hand, not tested with children.
- Layout targets tablets (768px and wider) and desktops. Phones work but are cramped.
