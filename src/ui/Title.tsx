import { useEffect, useState } from 'preact/hooks';
import { loadIndex, type SnapshotIndexEntry } from '../data/loader';
import { CONFIG } from '../sim/config';
import type { MissionChoice } from './App';
import { Button, Term } from './components';
import { FACTS } from './copy';
import { isTutorialDone, shouldShowTutorial } from './tutorial';

const newSeed = () => 1000 + Math.floor(Math.random() * 9000);

interface Props {
  /** 'live' while asking NASA, 'saved' while loading bundled files. */
  busy: 'live' | 'saved' | null;
  error: string | null;
  /** Stop waiting for NASA and use saved data. */
  onCancel: () => void;
  onStart: (choice: MissionChoice, seed: number, tutorial: boolean) => void;
  onSources: () => void;
  onTeacher: () => void;
}

export function Title({ busy, error, onCancel, onStart, onSources, onTeacher }: Props) {
  const [index, setIndex] = useState<SnapshotIndexEntry[] | null>(null);
  const [seedText, setSeedText] = useState(() => String(newSeed()));
  // The tutorial shows on the first mission only, unless the player asks to see it again.
  const [tutorialDone] = useState(() => isTutorialDone());
  const [replayTutorial, setReplayTutorial] = useState(false);

  useEffect(() => {
    loadIndex((url) => fetch(url))
      .then(setIndex)
      .catch(() => setIndex([]));
  }, []);

  const seed = Math.max(1, Math.min(999999, Math.floor(Number(seedText)) || 1));
  const go = (choice: MissionChoice) => onStart(choice, seed, shouldShowTutorial(replayTutorial));
  const replays = (index ?? []).filter((e) => e.kind === 'replay');

  return (
    <main class="page title-page">
      <header class="hero">
        <div class="hero-text">
          <p class="kicker">Junior Astronaut Mission Trainer</p>
          <h1>Red Planet Outpost</h1>
          <p class="lead">
            You are in charge of a Mars base for {CONFIG.sols} <Term id="sol">sols</Term>. The Sun gives you power, but never
            enough for everything. Keep your crew safe <em>and</em> do the science.
          </p>
          <p class="hero-credit">Photo: the Curiosity rover on Mars. Credit: NASA/JPL-Caltech/MSSS</p>
        </div>
      </header>

      <section class="how" aria-label="How to play">
        <div class="how-item">
          <span aria-hidden="true">⚡</span>
          <p>Each sol, share your power cells between 4 systems.</p>
        </div>
        <div class="how-item">
          <span aria-hidden="true">☀️</span>
          <p>
            Watch out for <Term id="flare">solar flares</Term> and dust storms.
          </p>
        </div>
        <div class="how-item">
          <span aria-hidden="true">🔬</span>
          <p>Collect {CONFIG.scienceGoal} samples before the mission ends. Extra samples earn bonus stars.</p>
        </div>
        <div class="how-item">
          <span aria-hidden="true">⏳</span>
          <p>No timer. Take as long as you like to think.</p>
        </div>
      </section>

      <h2>Choose a mission</h2>
      {error && (
        <p class="alert" role="alert">
          ⚠️ {error}
        </p>
      )}
      <div class="missions">
        {replays.map((r) => (
          <article class="mission-card" key={r.id}>
            <span class="badge badge-archived">📦 REAL STORM REPLAY</span>
            <h3>{r.title}</h3>
            <p>{r.blurb}</p>
            <p class="small">
              Real NASA DONKI records, {r.start} to {r.end}.{r.marsObserved ? ' Also measured at Mars.' : ''}
            </p>
            <Button kind="primary" disabled={busy !== null} onClick={() => go({ kind: 'replay', id: r.id })}>
              ▶ Play this storm
            </Button>
          </article>
        ))}
        <article class="mission-card">
          <span class="badge badge-live">🟢 LIVE if online</span>
          <h3>Today's Sun</h3>
          <p>What has the Sun done in the last 10 days? The game asks NASA right now.</p>
          <p class="small">If NASA cannot be reached, the game uses saved data and tells you.</p>
          <Button kind="primary" disabled={busy !== null} onClick={() => go({ kind: 'live' })}>
            ▶ Play today's Sun
          </Button>
        </article>
        <article class="mission-card">
          <span class="badge badge-game">🎲 GAME EVENTS</span>
          <h3>Random mission</h3>
          <p>Made-up storms. A new surprise for every seed number.</p>
          <p class="small">Good for practice. Not real data.</p>
          <Button kind="primary" disabled={busy !== null} onClick={() => go({ kind: 'random' })}>
            ▶ Play random
          </Button>
        </article>
      </div>
      {busy === 'saved' && (
        <p class="loading" role="status">
          📡 Getting your mission ready…
        </p>
      )}
      {busy === 'live' && (
        <div class="asking" role="status" aria-live="polite">
          <div class="asking-box">
            <p class="asking-title">
              <span class="asking-dish" aria-hidden="true">📡</span> Asking NASA about the Sun…
            </p>
            <p class="small">This takes a few seconds. If NASA does not answer, the game uses saved data and tells you.</p>
            <Button kind="primary" autoFocus onClick={onCancel}>
              ✖ Cancel and use saved data
            </Button>
          </div>
        </div>
      )}

      <section class="options" aria-label="Mission options">
        <label class="field">
          <span>
            Mission seed <span class="small">(same number = same mission, good for a class)</span>
          </span>
          <span class="seed-row">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999999}
              value={seedText}
              onInput={(e) => setSeedText((e.target as HTMLInputElement).value)}
              aria-label="Mission seed number"
            />
            <Button onClick={() => setSeedText(String(newSeed()))}>🎲 New seed</Button>
          </span>
        </label>
        <p class="tutorial-note">
          {!tutorialDone && 'Your first mission starts with a short tutorial. You can skip it.'}
          {tutorialDone && !replayTutorial && (
            <>
              You have seen the tutorial.{' '}
              <button type="button" class="link-btn" onClick={() => setReplayTutorial(true)}>
                Replay tutorial
              </button>
            </>
          )}
          {tutorialDone && replayTutorial && (
            <>
              ✓ Your next mission will start with the tutorial.{' '}
              <button type="button" class="link-btn" onClick={() => setReplayTutorial(false)}>
                Do not show it
              </button>
            </>
          )}
        </p>
      </section>

      <section class="did-you-know">
        <h2>Did you know?</h2>
        <ul>
          <li>
            A <Term id="sol" /> lasts {FACTS.sol_length.display}. Mars turns a little slower than Earth.
          </li>
          <li>
            A radio message from Mars takes {FACTS.light_delay_min.value} to {FACTS.light_delay_max.value} minutes to reach Earth.
            That is the <Term id="commdelay" />.
          </li>
          <li>
            In 2018, a giant dust storm hid the Sun from the solar-powered Opportunity rover. Its last message came on{' '}
            {FACTS.opportunity_last_contact.value}.
          </li>
        </ul>
      </section>

      <footer class="foot">
        <Button kind="ghost" onClick={onSources}>
          🔎 The Science Behind This
        </Button>
        <Button kind="ghost" onClick={onTeacher}>
          🍎 For teachers and parents
        </Button>
        <p class="small">No account. No ads. No tracking. Built for the NASA Space Apps Challenge 2026.</p>
      </footer>
    </main>
  );
}
